let officeData = null;
let selectedMention = '@자비스';
let selectedAgent = null;
let motionEnabled = true;

const LOCAL_CHAT_KEY = 'hanmiru_local_chats_v1';
const LOCAL_MEMO_KEY = 'hanmiru_local_memos_v1';
const LOCAL_WORKING_KEY = 'hanmiru_working_agents_v1';
const GH_TOKEN_KEY = 'hanmiru_gh_token_v1';
const GH_REPO = 'yileet22-ui/-';

// 방 이동용 웨이포인트 (대회의실, 지휘실, 생활실, 해상실, 라운지)
const WORK_SPOTS = [
  { top: '34%', left: '24%' }, // 대회의실
  { top: '27%', left: '49%' }, // 지휘실
  { top: '52%', left: '40%' }, // 생활실
  { top: '47%', left: '67%' }, // 해상실
  { top: '71%', left: '72%' }  // 라운지/부동산실
];

async function loadData() {
  try {
    const res = await fetch(`./data.json?t=${Date.now()}`);
    const newData = await res.json();
    if (officeData && officeData.updatedAt !== newData.updatedAt) {
      // 서버(data.json)가 새로 갱신되면 로컬 작업중 표시 초기화
      localStorage.removeItem(LOCAL_WORKING_KEY);
    }
    officeData = newData;
    renderAll();
  } catch (e) {
    showToast('데이터를 불러오는 중 문제가 생겼어요.');
  }
}

function getWorkingMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_WORKING_KEY) || '{}');
    const now = Date.now();
    const cleaned = {};
    for (const [k, ts] of Object.entries(raw)) {
      if (now - ts < 6 * 60 * 1000) cleaned[k] = ts;
    }
    return cleaned;
  } catch {
    return {};
  }
}

function markAgentWorking(text) {
  const map = getWorkingMap();
  const targets = [];
  if (text.includes('@마루')) targets.push('maru');
  if (text.includes('@마린이')) targets.push('marine');
  if (text.includes('@부캉이')) targets.push('bukang');
  if (text.includes('@자비스') || targets.length === 0) targets.push('jarvis');
  const now = Date.now();
  targets.forEach((id) => { map[id] = now; });
  localStorage.setItem(LOCAL_WORKING_KEY, JSON.stringify(map));
}

function renderAll() {
  if (!officeData) return;
  document.getElementById('last-updated-chip').textContent = `🕒 ${officeData.updatedAt}`;
  renderOfficePins();
  renderKeyStatus();
  renderChats();
  renderTasks();
  renderAgentGrid();
  renderMemos();
}

function renderKeyStatus() {
  const token = localStorage.getItem(GH_TOKEN_KEY);
  const bar = document.getElementById('key-status-bar');
  const btn = document.getElementById('btn-toggle-key');
  if (token) {
    bar.innerHTML = '🟢 실시간 양방향 연결됨 · 채팅 치면 최대 5분 내 자동 응답';
    bar.style.color = '#15803D';
    btn.textContent = '🔑 연결됨';
  } else {
    bar.innerHTML = '⚪ 아직 연결 키가 없어요 (오른쪽 위 <b>🔑 연결 설정</b>을 눌러 입력해 주세요)';
    bar.style.color = '#92400E';
    btn.textContent = '🔑 연결 설정';
  }
}

function renderOfficePins() {
  const container = document.getElementById('office-pins');
  container.innerHTML = '';
  const workingMap = getWorkingMap();

  officeData.agents.forEach((agent) => {
    const isWorking = Boolean(workingMap[agent.id]) || agent.status === '작업중';
    const pin = document.createElement('div');
    pin.className = `agent-pin ${isWorking ? 'working' : ''}`;
    pin.dataset.agentId = agent.id;
    pin.style.top = agent.position.top;
    pin.style.left = agent.position.left;
    pin.innerHTML = `
      ${isWorking ? '<div class="agent-work-badge">⚡ 작업중...</div>' : ''}
      <div class="agent-room-pill">${agent.emoji} ${agent.room}</div>
      <div class="agent-avatar-wrap">
        <img src="${agent.avatar}" alt="${agent.name}" class="agent-avatar" />
        <span class="agent-status-dot"></span>
      </div>
      <div class="agent-name-tag">${agent.name}</div>
    `;
    pin.addEventListener('click', () => openAgentModal(agent));
    container.appendChild(pin);
  });
}

// 캐릭터들이 오피스 맵 위를 살아 움직이게 이동
function animateAgents() {
  if (!officeData || !motionEnabled) return;
  const workingMap = getWorkingMap();
  document.querySelectorAll('.agent-pin').forEach((pin) => {
    const id = pin.dataset.agentId;
    const agent = officeData.agents.find((a) => a.id === id);
    if (!agent) return;
    const isWorking = Boolean(workingMap[id]) || agent.status === '작업중';
    if (isWorking) {
      // 일하는 비서는 대회의실·지휘실·자기 방을 바쁘게 오감
      const spot = WORK_SPOTS[Math.floor(Math.random() * WORK_SPOTS.length)];
      pin.style.top = spot.top;
      pin.style.left = spot.left;
    } else {
      // 대기 중인 비서는 자기 방 근처에서 살짝씩 산책
      const baseTop = parseFloat(agent.position.top);
      const baseLeft = parseFloat(agent.position.left);
      const dTop = (Math.random() - 0.5) * 6;
      const dLeft = (Math.random() - 0.5) * 6;
      pin.style.top = `${baseTop + dTop}%`;
      pin.style.left = `${baseLeft + dLeft}%`;
    }
  });
}

function renderChats() {
  const list = document.getElementById('chat-list');
  const localChats = JSON.parse(localStorage.getItem(LOCAL_CHAT_KEY) || '[]');
  const all = [...officeData.messages, ...localChats];
  list.innerHTML = '';
  all.forEach((msg) => {
    const isUser = msg.agentId === 'user';
    const agent = officeData.agents.find((a) => a.id === msg.agentId);
    const avatarSrc = agent ? agent.avatar : './images/jarvis.png';
    const item = document.createElement('div');
    item.className = `chat-item ${isUser ? 'user' : ''}`;
    item.innerHTML = `
      ${isUser ? '' : `<img src="${avatarSrc}" alt="${msg.sender}" class="chat-avatar" />`}
      <div class="chat-bubble-wrap">
        <div class="chat-meta">${msg.sender} · ${msg.time}</div>
        <div class="chat-bubble">${escapeHtml(msg.text)}</div>
      </div>
    `;
    list.appendChild(item);
  });
  list.scrollTop = list.scrollHeight;
}

function renderTasks() {
  const list = document.getElementById('task-list');
  document.getElementById('task-count-label').textContent = `총 ${officeData.tasks.length}건`;
  list.innerHTML = '';
  officeData.tasks.forEach((t) => {
    const isWarn = t.status === '마감임박' || t.status === '대기중';
    const el = document.createElement('div');
    el.className = 'task-item';
    el.innerHTML = `
      <div class="task-top">
        <span class="task-agent">@${t.agent}</span>
        <span class="task-badge ${isWarn ? 'warn' : ''}">${t.status} · ${t.time}</span>
      </div>
      <div class="task-title">${escapeHtml(t.title)}</div>
      <div class="task-summary">${escapeHtml(t.summary)}</div>
    `;
    list.appendChild(el);
  });
}

function renderAgentGrid() {
  const grid = document.getElementById('agent-grid');
  grid.innerHTML = '';
  const workingMap = getWorkingMap();
  officeData.agents.forEach((agent) => {
    const isWorking = Boolean(workingMap[agent.id]) || agent.status === '작업중';
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.innerHTML = `
      <img src="${agent.avatar}" alt="${agent.name}" class="agent-card-avatar" />
      <div>
        <div class="agent-card-title">
          <span>${agent.name}</span>
          <span class="agent-card-role">${agent.emoji} ${agent.room} · ${isWorking ? '⚡ 작업중' : agent.role}</span>
        </div>
        <div class="agent-card-task"><strong>현재:</strong> ${escapeHtml(agent.currentTask)}</div>
        <div class="agent-card-desc">${escapeHtml(agent.description)}</div>
      </div>
    `;
    card.addEventListener('click', () => openAgentModal(agent));
    grid.appendChild(card);
  });
}

function renderMemos() {
  const list = document.getElementById('memo-list');
  const localMemos = JSON.parse(localStorage.getItem(LOCAL_MEMO_KEY) || '[]');
  const all = [...localMemos, ...officeData.memos];
  list.innerHTML = '';
  all.forEach((m) => {
    const el = document.createElement('div');
    el.className = 'memo-item';
    el.innerHTML = `
      <span>${escapeHtml(m.text)}</span>
      <span class="memo-tag">${escapeHtml(m.tag || '메모')}</span>
    `;
    list.appendChild(el);
  });
}

function openAgentModal(agent) {
  selectedAgent = agent;
  const workingMap = getWorkingMap();
  const isWorking = Boolean(workingMap[agent.id]) || agent.status === '작업중';
  document.getElementById('modal-avatar').src = agent.avatar;
  document.getElementById('modal-room').textContent = `${agent.emoji} ${agent.room} · ${isWorking ? '⚡ 작업중' : agent.status}`;
  document.getElementById('modal-name').textContent = agent.name;
  document.getElementById('modal-role').textContent = agent.role;
  document.getElementById('modal-task').textContent = agent.currentTask;
  document.getElementById('modal-desc').textContent = agent.description;
  document.getElementById('agent-modal').classList.add('open');
}

function closeAgentModal() {
  document.getElementById('agent-modal').classList.remove('open');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `tab-${tabName}`);
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('btn-toggle-key').addEventListener('click', () => {
  const panel = document.getElementById('key-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('btn-save-key').addEventListener('click', () => {
  const val = document.getElementById('gh-token-input').value.trim();
  if (!val) {
    showToast('키를 입력해 주세요.');
    return;
  }
  localStorage.setItem(GH_TOKEN_KEY, val);
  document.getElementById('gh-token-input').value = '';
  document.getElementById('key-panel').style.display = 'none';
  renderKeyStatus();
  showToast('연결 키가 저장됐어요! 이제 채팅을 보내 보세요.');
});

document.getElementById('btn-style-basic').addEventListener('click', () => {
  document.getElementById('btn-style-basic').classList.add('active');
  document.getElementById('btn-style-clay').classList.remove('active');
  document.getElementById('office-stage').classList.remove('clay');
});

document.getElementById('btn-style-clay').addEventListener('click', () => {
  document.getElementById('btn-style-clay').classList.add('active');
  document.getElementById('btn-style-basic').classList.remove('active');
  document.getElementById('office-stage').classList.add('clay');
});

document.getElementById('btn-motion').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  motionEnabled = btn.classList.toggle('active');
  btn.textContent = motionEnabled ? '✨ 움직임 ON' : '⏸️ 움직임 OFF';
  document.getElementById('office-stage').classList.toggle('motion-on', motionEnabled);
  if (!motionEnabled) renderOfficePins();
});

document.getElementById('modal-close').addEventListener('click', closeAgentModal);
document.getElementById('agent-modal').addEventListener('click', (e) => {
  if (e.target.id === 'agent-modal') closeAgentModal();
});

document.getElementById('modal-ask-btn').addEventListener('click', () => {
  if (!selectedAgent) return;
  closeAgentModal();
  switchTab('meeting');
  selectedMention = `@${selectedAgent.name}`;
  document.querySelectorAll('.mention-chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.mention === selectedMention);
  });
  const input = document.getElementById('chat-input');
  input.value = `${selectedMention} `;
  input.focus();
});

document.querySelectorAll('.mention-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    selectedMention = chip.dataset.mention;
    document.querySelectorAll('.mention-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    const input = document.getElementById('chat-input');
    if (!input.value.startsWith('@')) {
      input.value = `${selectedMention} ${input.value}`;
    }
    input.focus();
  });
});

document.getElementById('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const raw = input.value.trim();
  if (!raw) return;
  const text = raw.startsWith('@') ? raw : `${selectedMention} ${raw}`;
  const token = localStorage.getItem(GH_TOKEN_KEY);

  if (!token) {
    document.getElementById('key-panel').style.display = 'block';
    showToast('먼저 연결 키를 입력해 주세요!');
    return;
  }

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const localChats = JSON.parse(localStorage.getItem(LOCAL_CHAT_KEY) || '[]');
  localChats.push({ id: Date.now(), sender: '창민님', agentId: 'user', time: timeStr, text });
  localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(localChats));
  markAgentWorking(text);
  input.value = '';
  renderChats();
  renderOfficePins();
  renderAgentGrid();
  setTimeout(animateAgents, 150);

  try {
    const resp = await fetch(`https://api.github.com/repos/${GH_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: `[비서실] ${text.slice(0, 60)}`,
        body: text
      })
    });
    if (resp.ok) {
      showToast('✅ 비서실 전달 완료! 오피스 맵에서 일하는 모습을 확인해 보세요.');
    } else {
      showToast('⚠️ 키 확인이 필요해요. (권한 오류)');
    }
  } catch {
    showToast('⚠️ 전송 중 네트워크 오류가 났어요.');
  }
});

document.getElementById('memo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('memo-input');
  const text = input.value.trim();
  if (!text) return;
  const localMemos = JSON.parse(localStorage.getItem(LOCAL_MEMO_KEY) || '[]');
  localMemos.unshift({ id: Date.now(), tag: '내 메모', text });
  localStorage.setItem(LOCAL_MEMO_KEY, JSON.stringify(localMemos));
  input.value = '';
  renderMemos();
  showToast('메모를 저장했어요!');
});

loadData();
setInterval(loadData, 15000);
setInterval(animateAgents, 3200);
