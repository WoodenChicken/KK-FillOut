/**
 * 后台 Service Worker（无远程请求，纯本地）：
 * - 快捷键/工具栏 → 开关悬浮球
 * - SPA 路由变化通知内容脚本重扫
 * - Side Panel（简历编辑器）打开
 * - 「修正填充」训练样本写入扩展自己的 IndexedDB（绝不经过页面域存储）
 * - 按需注入本地 TFJS + 推理桥
 */

const PANEL_URL = chrome.runtime.getURL('panel/panel.html');

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({ id: 'fo-toggle', title: '显示/隐藏 填表小精灵（Ctrl+Shift+B）', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'fo-panel', title: '打开简历编辑器', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'fo-sep', type: 'separator', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'fo-fill', title: '⚡ 一键填充本页表单', contexts: ['all'] });
  } catch (e) { /* 重复创建忽略 */ }
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'fo-toggle') sendToTab(tab.id, { type: 'FO_TOGGLE_BALL' });
  else if (info.menuItemId === 'fo-panel') openPanel(tab);
  else if (info.menuItemId === 'fo-fill') {
    sendToTab(tab.id, { type: 'FO_TOGGLE_BALL' });
    setTimeout(() => sendToTab(tab.id, { type: 'FO_MENU_FILL' }), 350);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-ball') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) sendToTab(tab.id, { type: 'FO_TOGGLE_BALL' });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id) sendToTab(tab.id, { type: 'FO_TOGGLE_BALL' });
});

// SPA 路由切换（北森/Moka 分步表单常用 pushState）→ 重新扫描
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0 && details.tabId >= 0) {
    sendToTab(details.tabId, { type: 'FO_URL_CHANGED' });
  }
});

function sendToTab(tabId, msg) {
  try {
    chrome.tabs.sendMessage(tabId, msg, () => void chrome.runtime.lastError);
  } catch (e) { /* 页面不支持注入时静默 */ }
}

async function openPanel(tab) {
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
      await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'panel/panel.html', enabled: true });
      return;
    }
    throw new Error('no sidePanel');
  } catch (e) {
    chrome.tabs.create({ url: PANEL_URL });
  }
}

// ---------- 消息中枢 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'FO_OPEN_PANEL':
      openPanel(sender.tab || { id: chrome.windows.WINDOW_ID_CURRENT }).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false })
      );
      return true; // async
    case 'FO_OPEN_TAB':
      chrome.tabs.create({ url: PANEL_URL });
      sendResponse({ ok: true });
      break;
    case 'FO_LOG_SAMPLE':
      saveSample(msg.sample).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true;
    case 'FO_GET_SAMPLES_COUNT':
      countSamples().then((n) => sendResponse({ ok: true, count: n }), () => sendResponse({ ok: false, count: 0 }));
      return true;
    case 'FO_EXPORT_SAMPLES':
      exportSamples().then(
        (rows) => sendResponse({ ok: true, rows }),
        () => sendResponse({ ok: false, rows: [] })
      );
      return true;
    case 'FO_CLEAR_ALL_DATA':
      clearAllData().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true;
    case 'FO_INJECT_ML':
      injectML(sender.tab && sender.tab.id).then(
        () => sendResponse({ ok: true }),
        (err) => sendResponse({ ok: false, error: String(err && err.message || err) })
      );
      return true;
  }
  // no async response needed
});

async function injectML(tabId) {
  if (!tabId || tabId < 0) throw new Error('no tab');
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['vendor/tf.min.js', 'ml/tf-bridge.js']
  });
}

// ---------- 训练样本 IndexedDB（扩展域，本地） ----------
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('fillout-local', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('samples')) {
        req.result.createObjectStore('samples', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSample(sample) {
  if (!sample || !sample.label) return;
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('samples', 'readwrite');
    tx.objectStore('samples').add({ ...sample, ts: sample.ts || Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function countSamples() {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction('samples', 'readonly');
    const rq = tx.objectStore('samples').count();
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => resolve(0);
  });
}

async function exportSamples() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('samples', 'readonly');
    const rq = tx.objectStore('samples').getAll();
    rq.onsuccess = () => resolve(rq.result || []);
    rq.onerror = () => reject(rq.error);
  });
}

async function clearAllData() {
  const db = await idb();
  await new Promise((resolve) => {
    const tx = db.transaction('samples', 'readwrite');
    tx.objectStore('samples').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => resolve();
  });
  await chrome.storage.local.clear();
}
