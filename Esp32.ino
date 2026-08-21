<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rover Control</title>
<style>
  :root {
    --bg: #0d1117;
    --panel: #151b23;
    --grid: #1f2733;
    --accent: #ff8c3c;
    --accent-dim: #7a4a24;
    --text: #e6edf3;
    --text-dim: #6b7683;
    --danger: #ff4d4d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background:
      linear-gradient(var(--grid) 1px, transparent 1px) 0 0 / 100% 32px,
      linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 32px 100%,
      var(--bg);
    color: var(--text);
    font-family: 'Courier New', ui-monospace, monospace;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px 48px;
  }
  header {
    width: 100%;
    max-width: 420px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid var(--grid);
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  h1 {
    font-size: 15px;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin: 0;
    color: var(--accent);
  }
  .dots { display: flex; gap: 14px; }
  .dot-group { display: flex; align-items: center; }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-dim);
    display: inline-block;
    margin-right: 6px;
  }
  .status-dot.ok { background: #3ddc84; box-shadow: 0 0 8px #3ddc84; }
  .status-dot.err { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
  .status-text { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }

  .panel {
    width: 100%;
    max-width: 420px;
    background: var(--panel);
    border: 1px solid var(--grid);
    border-radius: 4px;
    padding: 24px;
  }

  .panel + .panel { margin-top: 16px; }

  .panel-label {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin: 0 0 14px;
  }

  /* ---- Camera panel ---- */
  .cam-frame {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #000;
    border: 1px solid var(--grid);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }
  .cam-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cam-placeholder {
    color: var(--text-dim);
    font-size: 11px;
    text-align: center;
    padding: 16px;
    letter-spacing: 1px;
  }
  .cam-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
  }
  .cam-toolbar button {
    background: #1a2129;
    border: 1px solid var(--grid);
    color: var(--text-dim);
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
  }
  .cam-toolbar button:hover { border-color: var(--accent); color: var(--text); }

  /* ---- Drive panel ---- */
  .dpad {
    display: grid;
    grid-template-columns: repeat(3, 72px);
    grid-template-rows: repeat(3, 72px);
    gap: 8px;
    justify-content: center;
    margin-bottom: 24px;
  }
  .dpad .forward { grid-column: 2; grid-row: 1; }
  .dpad .left { grid-column: 1; grid-row: 2; }
  .dpad .stop { grid-column: 2; grid-row: 2; }
  .dpad .right { grid-column: 3; grid-row: 2; }
  .dpad .backward { grid-column: 2; grid-row: 3; }
  .dpad button {
    background: #1a2129;
    border: 1px solid var(--grid);
    color: var(--text);
    font-family: inherit;
    font-size: 20px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s, transform 0.05s;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }
  .dpad button:active, .dpad button.active {
    background: var(--accent-dim);
    border-color: var(--accent);
    transform: scale(0.96);
  }
  .dpad .stop { color: var(--danger); border-color: var(--danger); }

  .speed-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .speed-row label {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    width: 60px;
  }
  input[type="range"] {
    flex: 1;
    accent-color: var(--accent);
  }
  #speed-val {
    width: 34px;
    text-align: right;
    color: var(--accent);
    font-size: 13px;
  }

  #log {
    font-size: 11px;
    color: var(--text-dim);
    border-top: 1px solid var(--grid);
    padding-top: 12px;
    min-height: 16px;
  }

  .config-toggle {
    font-size: 11px;
    color: var(--text-dim);
    text-align: right;
    width: 100%;
    max-width: 420px;
    margin-top: 12px;
    cursor: pointer;
    text-decoration: underline;
  }
  .config {
    width: 100%;
    max-width: 420px;
    background: var(--panel);
    border: 1px solid var(--grid);
    border-radius: 4px;
    padding: 16px;
    margin-top: 8px;
    display: none;
  }
  .config.open { display: block; }
  .config input {
    width: 100%;
    background: #0d1117;
    border: 1px solid var(--grid);
    color: var(--text);
    font-family: inherit;
    font-size: 12px;
    padding: 8px;
    margin-bottom: 8px;
    border-radius: 3px;
  }
  .config label {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .config-section + .config-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--grid); }
  .config button {
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    color: var(--text);
    padding: 8px 16px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>

<header>
  <h1>Rover // Ctl</h1>
  <div class="dots">
    <div class="dot-group"><span class="status-dot" id="cam-dot"></span><span class="status-text" id="cam-status-text">cam not set</span></div>
    <div class="dot-group"><span class="status-dot" id="drive-dot"></span><span class="status-text" id="drive-status-text">not configured</span></div>
  </div>
</header>

<div class="panel">
  <p class="panel-label">Live Feed</p>
  <div class="cam-frame" id="cam-frame">
    <div class="cam-placeholder" id="cam-placeholder">set camera IP below to start stream</div>
    <img id="cam-img" style="display:none;">
  </div>
  <div class="cam-toolbar">
    <span class="status-text" id="cam-url-text">live via supabase realtime</span>
    <button id="cam-reload">Reconnect</button>
  </div>
</div>

<div class="panel">
  <p class="panel-label">Drive</p>
  <div class="dpad">
    <button class="forward" data-dir="forward">▲</button>
    <button class="left" data-dir="left">◀</button>
    <button class="stop" data-dir="stop">■</button>
    <button class="right" data-dir="right">▶</button>
    <button class="backward" data-dir="backward">▼</button>
  </div>

  <div class="speed-row">
    <label>Speed</label>
    <input type="range" id="speed" min="0" max="255" value="150">
    <span id="speed-val">150</span>
  </div>

  <div id="log">ready.</div>
</div>

<div class="config-toggle" id="config-toggle">configure connection ▾</div>
<div class="config" id="config">
  <div class="config-section">
    <label>Supabase Project URL</label>
    <input type="text" id="cfg-url" placeholder="https://xxxxx.supabase.co">
    <label>Anon / Publishable Key</label>
    <input type="text" id="cfg-key" placeholder="eyJ... or sb_publishable_...">
  </div>
  <button id="cfg-save">Save</button>
</div>

<script>
  // ---- elements ----
  const driveDot = document.getElementById('drive-dot');
  const driveStatusText = document.getElementById('drive-status-text');
  const camDot = document.getElementById('cam-dot');
  const camStatusText = document.getElementById('cam-status-text');
  const camUrlText = document.getElementById('cam-url-text');
  const log = document.getElementById('log');
  const speedSlider = document.getElementById('speed');
  const speedVal = document.getElementById('speed-val');
  const configPanel = document.getElementById('config');
  const configToggle = document.getElementById('config-toggle');
  const camImg = document.getElementById('cam-img');
  const camPlaceholder = document.getElementById('cam-placeholder');
  const camReloadBtn = document.getElementById('cam-reload');

  // ---- persisted config ----
  let SUPA_URL = localStorage.getItem('rover_url') || '';
  let SUPA_KEY = localStorage.getItem('rover_key') || '';

  document.getElementById('cfg-url').value = SUPA_URL;
  document.getElementById('cfg-key').value = SUPA_KEY;

  configToggle.onclick = () => configPanel.classList.toggle('open');

  document.getElementById('cfg-save').onclick = () => {
    SUPA_URL = document.getElementById('cfg-url').value.trim().replace(/\/$/, '');
    SUPA_KEY = document.getElementById('cfg-key').value.trim();

    localStorage.setItem('rover_url', SUPA_URL);
    localStorage.setItem('rover_key', SUPA_KEY);

    configPanel.classList.remove('open');
    if (SUPA_URL && SUPA_KEY) setDriveStatus('idle', 'configured');
    connectCamFeed();
  };

  function setDriveStatus(state, text) {
    driveDot.className = 'status-dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : '');
    driveStatusText.textContent = text;
  }
  function setCamStatus(state, text) {
    camDot.className = 'status-dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : '');
    camStatusText.textContent = text;
  }

  if (SUPA_URL && SUPA_KEY) setDriveStatus('idle', 'configured');

  // ---- camera feed (live via Supabase Realtime) ----
  let sbClient = null;
  let camChannel = null;
  let framesReceived = 0;

  function connectCamFeed() {
    if (!SUPA_URL || !SUPA_KEY) {
      camPlaceholder.textContent = 'set your Supabase URL + key below';
      setCamStatus('', 'cam not set');
      return;
    }

    if (camChannel) {
      sbClient.removeChannel(camChannel);
      camChannel = null;
    }

    camPlaceholder.style.display = 'block';
    camImg.style.display = 'none';
    camPlaceholder.textContent = 'connecting to live feed...';
    setCamStatus('', 'connecting...');
    framesReceived = 0;

    if (!sbClient) {
      sbClient = supabase.createClient(SUPA_URL, SUPA_KEY);
    }

    camChannel = sbClient
      .channel('car-camera-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'car_camera', filter: 'id=eq.1' },
        (payload) => {
          const frame = payload.new && payload.new.frame;
          if (!frame) return;
          camImg.src = 'data:image/jpeg;base64,' + frame;
          camImg.style.display = 'block';
          camPlaceholder.style.display = 'none';
          framesReceived++;
          setCamStatus('ok', 'live');
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setCamStatus('ok', 'connected — waiting for frames');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setCamStatus('err', 'connection error');
          camPlaceholder.style.display = 'block';
          camImg.style.display = 'none';
          camPlaceholder.textContent = 'realtime connection failed — check URL/key';
        } else if (status === 'CLOSED') {
          setCamStatus('err', 'disconnected');
        }
      });
  }

  camReloadBtn.onclick = connectCamFeed;

  connectCamFeed();

  // ---- drive controls ----
  speedSlider.oninput = () => { speedVal.textContent = speedSlider.value; };

  async function sendCommand(direction) {
    if (!SUPA_URL || !SUPA_KEY) {
      log.textContent = 'set your Supabase URL + key first (below)';
      configPanel.classList.add('open');
      return;
    }
    log.textContent = `sending: ${direction}...`;
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/car_commands?id=eq.1`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          direction: direction,
          speed: parseInt(speedSlider.value, 10),
          updated_at: new Date().toISOString()
        })
      });
      if (res.ok) {
        setDriveStatus('ok', 'connected');
        log.textContent = `sent: ${direction} @ ${speedSlider.value}`;
      } else {
        setDriveStatus('err', 'error ' + res.status);
        log.textContent = `failed (${res.status}) — check URL/key/RLS policy`;
      }
    } catch (e) {
      setDriveStatus('err', 'unreachable');
      log.textContent = 'network error — check the URL';
    }
  }

  document.querySelectorAll('.dpad button').forEach(btn => {
    btn.addEventListener('click', () => sendCommand(btn.dataset.dir));
  });

  // keyboard support: arrows to drive, space to stop
  document.addEventListener('keydown', (e) => {
    const map = { ArrowUp: 'forward', ArrowDown: 'backward', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'stop' };
    if (map[e.key]) { e.preventDefault(); sendCommand(map[e.key]); }
  });
</script>

</body>
</html>
