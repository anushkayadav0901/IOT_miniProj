/*
prediction.js
Lightweight browser ML prediction engine using TensorFlow.js
- Fetches last 100 ThingSpeak entries
- Trains a tiny dense model on normalized features
- Retrains every 60s, predicts every 1s, fetches every 30s
- Predicts occupancy 10 minutes into the future

Implementation notes:
- Uses simple dense model (fast to train). Training is time-limited via callback (<200 ms target)
- Normalization uses min-max scaling calculated from the dataset
- Prediction uses last-known gas/ultrasonic values and advances time for the +10min horizon
- Produces predicted occupancy (0..1), a confidence score, and a trend array for the next 10 minutes
*/

// Config (can be changed to reuse constants from other scripts)
const PRED_CHANNEL_ID = typeof CHANNEL_ID !== 'undefined' ? CHANNEL_ID : '3358675';
const PRED_READ_API_KEY = typeof READ_API_KEY !== 'undefined' ? READ_API_KEY : 'XNLL6JBRE7I5NVFA';
const PRED_THINGSPEAK_URL = `https://api.thingspeak.com/channels/${PRED_CHANNEL_ID}/feeds.json?api_key=${PRED_READ_API_KEY}&results=100`;

// Runtime intervals (ms)
const FETCH_INTERVAL = 30_000; // fetch every 30s
const TRAIN_INTERVAL = 60_000; // retrain every 60s
const PREDICT_INTERVAL = 1_000; // predict every 1s

// Dynamic device detection to pick a lighter model on low-end machines
const HW_THREADS = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
const SMALL_DEVICE = HW_THREADS <= 2;

// Training time cap (ms) - abort training if it runs too long
const TRAIN_TIME_CAP_MS = SMALL_DEVICE ? 120 : 180; // keep under ~200ms

// Model & normalization state
let model = null;
let normalizer = null; // {min:[], max:[]}
let lastFetchedFeeds = null;
let lastPrepared = null; // {X, y, raw}
let lastPrediction = null;
let trendChart = null; // Chart.js instance

// UI element IDs (must exist in HTML snippet)
const UI = {
  card: 'predictionCard',
  value: 'predictedValue',
  confidence: 'confidenceLabel',
  trendCanvas: 'predictionTrend',
  status: 'predictionStatus'
};

/* -------------------- Helper: fetchThingSpeakData --------------------
   Returns array of feed objects (latest last). Each feed has: created_at, field1..field5
*/
async function fetchThingSpeakData() {
  try {
    const res = await fetch(PRED_THINGSPEAK_URL);
    if (!res.ok) throw new Error('ThingSpeak fetch failed');
    const json = await res.json();
    if (!json.feeds) return [];
    // Ensure we have latest-first order -> we want chronological
    const feeds = json.feeds.slice(-100);
    lastFetchedFeeds = feeds;
    return feeds;
  } catch (err) {
    console.error('fetchThingSpeakData error', err);
    return [];
  }
}

/* -------------------- Helper: prepareFeatures --------------------
   From feeds -> numeric arrays of features and labels
   Arduino field mapping:
     field1 = gasValue, field2 = distance(cm)
     field3 = IR1 (1=empty, 0=occupied)
     field4 = IR2 (1=empty, 0=occupied)
     field5 = IR3 (1=empty, 0=occupied)
   Features per row: [ir1, ir2, ir3, gasPPM, ultrasonicCm, hour, minute, timeIndex]
   Label: occupancy fraction (occupiedSlots / totalSlots) normalized 0..1
*/
function prepareFeatures(feeds) {
  if (!feeds || feeds.length === 0) return null;
  const rows = [];
  let timeIndex = 0;
  for (let i = 0; i < feeds.length; i++) {
    const f = feeds[i];
    // field1 = gas, field2 = distance
    const gas = f.field1 === null || f.field1 === undefined || f.field1 === '' ? 0 : parseFloat(f.field1);
    const ultrasonic = f.field2 === null || f.field2 === undefined || f.field2 === '' ? 0 : parseFloat(f.field2);
    // field3-5 = IR slots (1=occupied, 0=vacant)
    const ir1 = parseInt(f.field3) || 0;
    const ir2 = parseInt(f.field4) || 0;
    const ir3 = parseInt(f.field5) || 0;
    // Direct: 1=occupied, 0=vacant
    const s1occ = ir1;
    const s2occ = ir2;
    const s3occ = ir3;
    const ts = new Date(f.created_at);
    const hour = ts.getHours();
    const minute = ts.getMinutes();
    const occupied = s1occ + s2occ + s3occ;
    const occupancy = occupied / 3; // 0..1

    rows.push({
      x: [s1occ, s2occ, s3occ, gas, ultrasonic, hour, minute, timeIndex],
      y: occupancy,
      raw: {s1: s1occ, s2: s2occ, s3: s3occ, gas, ultrasonic, hour, minute, timeIndex, created_at: f.created_at}
    });
    timeIndex += 1;
  }
  return rows;
}

/* -------------------- Helper: normalizeData --------------------
   Computes min/max and scales inputs into [0,1]
*/
function computeNormalizer(rows) {
  const nFeatures = rows[0].x.length;
  const min = new Array(nFeatures).fill(Number.POSITIVE_INFINITY);
  const max = new Array(nFeatures).fill(Number.NEGATIVE_INFINITY);

  rows.forEach(r => {
    for (let i = 0; i < nFeatures; i++) {
      const v = Number(r.x[i]) || 0;
      if (v < min[i]) min[i] = v;
      if (v > max[i]) max[i] = v;
    }
  });

  // if min==max for a feature, expand slightly to avoid division by zero
  for (let i = 0; i < nFeatures; i++) {
    if (min[i] === Number.POSITIVE_INFINITY) min[i] = 0;
    if (max[i] === Number.NEGATIVE_INFINITY) max[i] = 0;
    if (max[i] === min[i]) {
      max[i] = min[i] + 1;
    }
  }

  return {min, max};
}

function normalizeRow(x, normalizer) {
  return x.map((v, i) => (v - normalizer.min[i]) / (normalizer.max[i] - normalizer.min[i]));
}

function denormalizeValue(normValue, originalMin, originalMax) {
  return normValue * (originalMax - originalMin) + originalMin;
}

/* -------------------- Helper: createModel --------------------
   Small dense model that outputs a single occupancy prediction (0..1 via sigmoid)
*/
function createModel(inputShape) {
  const m = tf.sequential();
  // adapt size based on device capability
  const units1 = SMALL_DEVICE ? 8 : 16;
  const units2 = SMALL_DEVICE ? 4 : 8;
  m.add(tf.layers.dense({units: units1, activation: 'relu', inputShape: [inputShape]}));
  m.add(tf.layers.dense({units: units2, activation: 'relu'}));
  m.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
  m.compile({optimizer: tf.train.adam(0.01), loss: 'meanSquaredError', metrics: ['mse']});
  console.log(`prediction.js: createModel units=${units1},${units2}, SMALL_DEVICE=${SMALL_DEVICE}`);
  return m;
}

/* -------------------- Helper: trainModel --------------------
   Trains the model on prepared X,y arrays. Training is time-limited via a custom callback.
*/
async function trainModel(model, X, y) {
  if (!model) return null;
  // Ensure TF backend is ready before creating tensors
  await tf.ready();
  const xs = tf.tensor2d(X);
  const ys = tf.tensor2d(y, [y.length, 1]);

  // custom callback to stop training if time exceeds cap
  const start = performance.now();
  let stoppedEarly = false;
  const timeLimitCallback = {
    onBatchEnd: async (batch, logs) => {
      const elapsed = performance.now() - start;
      if (elapsed > TRAIN_TIME_CAP_MS) {
        model.stopTraining = true;
        stoppedEarly = true;
      }
    }
  };
  // fit with small epoch count but allow callback to stop early
  const maxEpochs = SMALL_DEVICE ? 8 : 20;
  const batchSize = Math.min(SMALL_DEVICE ? 8 : 16, X.length);
  document.getElementById(UI.status)?.textContent = 'Training...';
  try {
    await model.fit(xs, ys, {
      epochs: maxEpochs, // max epochs
      batchSize,
      shuffle: true,
      callbacks: [timeLimitCallback]
    });
  } catch (err) {
    console.warn('Training interrupted or failed', err);
  } finally {
    const elapsed = Math.round(performance.now() - start);
    xs.dispose();
    ys.dispose();
    document.getElementById(UI.status)?.textContent = `Trained (${elapsed}ms)`;
  }

  return {stoppedEarly, elapsedMs: Math.round(performance.now() - start)};
}

/* -------------------- Helper: predictOccupancy --------------------
   Produces a single prediction for given feature vector (already normalized)
*/
function predictOccupancy(normX) {
  if (!model) return null;
  return tf.tidy(() => {
    const t = tf.tensor2d([normX]);
    const pred = model.predict(t);
    const val = pred.dataSync()[0];
    return val; // already 0..1 because of sigmoid
  });
}

/* -------------------- Helper: estimateConfidence --------------------
   Estimate confidence from training residuals (RMSE). Higher RMSE -> lower confidence.
   Returns 0..100
*/
function estimateConfidence(model, X, y) {
  try {
    const preds = tf.tidy(() => {
      const xs = tf.tensor2d(X);
      const p = model.predict(xs);
      const arr = p.dataSync();
      xs.dispose();
      p.dispose();
      return arr;
    });
    // compute RMSE
    let mse = 0;
    for (let i = 0; i < preds.length; i++) {
      const d = preds[i] - y[i];
      mse += d * d;
    }
    mse = mse / preds.length;
    const rmse = Math.sqrt(mse);

    // y range (0..1) for occupancy => rmse in [0..1]
    // confidence = clamp( (1 - rmse) * 100 )
    let conf = (1 - rmse) * 100;
    if (!isFinite(conf) || conf < 0) conf = 0;
    if (conf > 100) conf = 100;
    return Math.round(conf);
  } catch (err) {
    console.warn('estimateConfidence error', err);
    return 0;
  }
}

/* -------------------- Helper: createTrendArray --------------------
   Predict occupancy for each minute from now.. +10 minutes (10 points)
   Uses last known gas/ultrasonic and time index increment. Produces denormalized values.
*/
function createTrendArray(numPoints = 10) {
  if (!lastPrepared || !normalizer) return [];
  const lastRaw = lastPrepared.raw[lastPrepared.raw.length - 1];
  const baseTimeIndex = lastRaw.timeIndex;
  const lastGas = lastRaw.gas;
  const lastUltra = lastRaw.ultrasonic;
  const lastOccupancy = lastPrepared.y[lastPrepared.y.length - 1];

  const trend = [];
  for (let i = 1; i <= numPoints; i++) {
    // build synthetic feature for +i minute(s)
    const futureTimeIndex = baseTimeIndex + i; // relative
    const now = new Date(lastRaw.created_at);
    now.setMinutes(now.getMinutes() + i);
    const hour = now.getHours();
    const minute = now.getMinutes();
    // proxy for slot1..3 -> use last occupancy split equally
    const sProxy = lastOccupancy; // between 0..1 representing fraction
    const s1 = Math.round(sProxy > 0.5 ? 1 : 0);
    const s2 = s1; // simple proxy: assume same
    const s3 = s1;

    const rawX = [s1, s2, s3, lastGas, lastUltra, hour, minute, futureTimeIndex];
    const normX = normalizeRow(rawX, normalizer);
    const p = predictOccupancy(normX);
    // ensure finite
    const val = isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
    trend.push(Number(val.toFixed(3)));
  }
  return trend;
}

/* -------------------- UI Helpers -------------------- */
function animateNumberEl(el, target, duration = 600) {
  if (!el) return;
  const start = parseFloat(el.dataset.value) || parseFloat(el.textContent.replace('%','')) || 0;
  const end = target * 100; // show as percent
  el.dataset.value = end;
  const startTime = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const v = start + (end - start) * t;
    el.textContent = Math.round(v) + '%';
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function setCardColorByValue(el, value) {
  if (!el) return;
  el.classList.remove('green', 'yellow', 'red');
  if (value < 0.4) el.classList.add('green');
  else if (value < 0.7) el.classList.add('yellow');
  else el.classList.add('red');
}

/* -------------------- Chart Helper -------------------- */
function createOrUpdateTrendChart(labels, data) {
  const ctx = document.getElementById(UI.trendCanvas);
  if (!ctx) return;
  if (!trendChart) {
    trendChart = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderWidth: 2,
          borderColor: '#6d4aff',
          backgroundColor: 'rgba(109,74,255,0.12)',
          tension: 0.3,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  } else {
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = data;
    trendChart.update('none');
  }
}

/* -------------------- Main orchestration -------------------- */
async function buildAndTrainIfNeeded() {
  // Fix: null is falsy but [] is truthy — check length explicitly
  let feeds = (lastFetchedFeeds && lastFetchedFeeds.length > 0)
    ? lastFetchedFeeds
    : await fetchThingSpeakData();

  if (!feeds || feeds.length < 5) {
    console.warn('Not enough data to train (' + (feeds ? feeds.length : 0) + '/5 feeds)');
    return;
  }

  const rows = prepareFeatures(feeds);
  if (!rows || rows.length === 0) return;

  // store raw arrays
  const Xraw = rows.map(r => r.x);
  const yraw = rows.map(r => r.y);
  const rawList = rows.map(r => r.raw);

  // compute normalizer
  normalizer = computeNormalizer(rows);

  // normalized inputs
  const X = Xraw.map(x => normalizeRow(x, normalizer));
  const y = yraw;

  lastPrepared = {X, y, raw: rawList};

  if (!model) model = createModel(X[0].length);

  // train asynchronously, but don't block UI
  (async () => {
    try {
      const info = await trainModel(model, X, y);
      console.debug('Training info', info);
      // compute confidence using training residuals
      const conf = estimateConfidence(model, X, y);
      document.getElementById(UI.confidence)?.textContent = conf + '%';
      // update status
      document.getElementById(UI.status)?.textContent = `Trained (${info.elapsedMs}ms)`;
    } catch (err) {
      console.error('Training failed', err);
    }
  })();
}

async function runPredictionLoop() {
  // runs every PREDICT_INTERVAL and updates UI
  setInterval(() => {
    if (!model || !lastPrepared || !normalizer) return;
    // produce a trend
    const trend = createTrendArray(10);
    const lastVal = trend[trend.length - 1] ?? 0;

    // update UI: animated number, confidence label already updated in training
    const elVal = document.getElementById(UI.value);
    const elCard = document.getElementById(UI.card);
    if (elVal) animateNumberEl(elVal, lastVal, 500);
    if (elCard) setCardColorByValue(elCard, lastVal);

    // update mini-chart
    const labels = Array.from({length: trend.length}, (_, i) => `+${i+1}m`);
    createOrUpdateTrendChart(labels, trend.map(v => Math.round(v*100)/100));

    lastPrediction = {value: lastVal, trend};
  }, PREDICT_INTERVAL);
}

/* -------------------- Scheduler -------------------- */
async function startPredictionEngine() {
  // initial fetch
  await fetchThingSpeakData();
  // initial build+train
  await buildAndTrainIfNeeded();

  // schedule fetch every 30s
  setInterval(async () => {
    await fetchThingSpeakData();
  }, FETCH_INTERVAL);

  // schedule training every 60s
  setInterval(async () => {
    try {
      await buildAndTrainIfNeeded();
    } catch (err) {
      console.error('retrain error', err);
    }
  }, TRAIN_INTERVAL);

  // start prediction loop
  runPredictionLoop();
}

/* -------------------- Exports / Auto-init --------------------
   Call startPredictionEngine() after the DOM is ready and TensorFlow.js is loaded.
*/
window.PredictionEngine = {
  start: startPredictionEngine,
  fetchThingSpeakData,
  prepareFeatures,
  createModel
};

// Auto-init: retry until tf is available
function _tryAutoStart() {
  if (typeof tf === 'undefined') {
    setTimeout(_tryAutoStart, 200);
    return;
  }
  startPredictionEngine();
}

if (document.readyState === 'complete') {
  _tryAutoStart();
} else {
  window.addEventListener('load', _tryAutoStart);
}
