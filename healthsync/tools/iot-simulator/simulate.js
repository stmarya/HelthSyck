#!/usr/bin/env node
/**
 * HealthSync IoT Simulator
 *
 * Mensimulasikan Samsung Galaxy Watch yang mengirim vital signs ke EMQX via MQTT.
 *
 * Usage:
 *   node simulate.js [options]
 *
 * Options:
 *   --scenario=<name>    Skenario simulasi (normal|level1|level2|critical|recovery|stress)
 *   --patientId=<uuid>   Patient UUID (default: test UUID)
 *   --deviceId=<id>      Device ID (default: GW6-TEST-001)
 *   --broker=<url>       MQTT broker URL (default: mqtt://localhost:1883)
 *   --interval=<ms>      Interval antar reading dalam ms (default: 5000)
 *   --count=<n>          Jumlah readings (default: 60, 0 = infinite)
 *   --help               Tampilkan help
 */

'use strict';

const mqtt = require('mqtt');

// ── Config dari args ───────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [key, val] = a.slice(2).split('=');
      return [key, val ?? 'true'];
    })
);

if (args.help) {
  console.log(`
HealthSync IoT Simulator

Usage: node simulate.js [options]

Options:
  --scenario=<name>    normal | level1 | level2 | critical | recovery | stress
  --patientId=<uuid>   Patient UUID
  --deviceId=<id>      Device ID
  --broker=<url>       MQTT broker (default: mqtt://localhost:1883)
  --interval=<ms>      Interval ms (default: 5000)
  --count=<n>          Total readings (0 = infinite, default: 60)

Scenarios:
  normal    Normal vital signs (HR 65-80, SpO2 97-99)
  level1    Warning threshold (HR 125+, SpO2 91%)
  level2    Urgent threshold (HR 155+, SpO2 87%)
  critical  Critical threshold (HR 185+, SpO2 82%)
  recovery  Starts critical, recovers to normal over 10 readings
  stress    Progressively increases HR from 70 to 190 over readings
`);
  process.exit(0);
}

const SCENARIO    = args.scenario  || 'normal';
const PATIENT_ID  = args.patientId || '550e8400-e29b-41d4-a716-446655440000';
const DEVICE_ID   = args.deviceId  || 'GW6-TEST-001';
const BROKER_URL  = args.broker    || 'mqtt://localhost:1883';
const INTERVAL_MS = parseInt(args.interval || '5000', 10);
const COUNT       = parseInt(args.count    || '60',   10);

// ── Scenario definitions ───────────────────────────────────────────────────────
const SCENARIOS = {
  normal: {
    description: 'Normal vital signs — continuous monitoring',
    getVitals: (_i) => ({
      heart_rate:   randInt(65, 80),
      spo2:         randFloat(97, 99),
      systolic_bp:  randInt(115, 125),
      diastolic_bp: randInt(75, 85),
      temperature:  randFloat(36.3, 36.8),
      activity_level: 'resting',
    }),
  },

  level1: {
    description: 'Level 1 Warning — HR > 120, SpO2 < 92%',
    getVitals: (_i) => ({
      heart_rate:   randInt(122, 135),
      spo2:         randFloat(90, 91.9),
      systolic_bp:  randInt(140, 155),
      diastolic_bp: randInt(90, 100),
      temperature:  randFloat(37.5, 38.0),
      activity_level: 'walking',
    }),
  },

  level2: {
    description: 'Level 2 Urgent — HR > 150, SpO2 < 88%',
    getVitals: (_i) => ({
      heart_rate:   randInt(152, 165),
      spo2:         randFloat(86, 87.9),
      systolic_bp:  randInt(160, 175),
      diastolic_bp: randInt(100, 110),
      temperature:  randFloat(38.5, 39.2),
      activity_level: 'resting',
    }),
  },

  critical: {
    description: 'Level 3 Critical — HR > 180, SpO2 < 85%',
    getVitals: (_i) => ({
      heart_rate:   randInt(182, 195),
      spo2:         randFloat(81, 84.9),
      systolic_bp:  randInt(175, 190),
      diastolic_bp: randInt(110, 120),
      temperature:  randFloat(39.5, 40.5),
      activity_level: 'resting',
    }),
  },

  recovery: {
    description: 'Recovery — starts critical, normalizes over 10 readings',
    getVitals: (i) => {
      const progress = Math.min(i / 10, 1); // 0 → 1 over first 10 readings
      return {
        heart_rate:   Math.round(190 - (190 - 72) * progress),
        spo2:         parseFloat((82 + (97 - 82) * progress).toFixed(1)),
        systolic_bp:  Math.round(185 - (185 - 120) * progress),
        diastolic_bp: Math.round(115 - (115 - 80) * progress),
        temperature:  parseFloat((40.2 - (40.2 - 36.5) * progress).toFixed(1)),
        activity_level: 'resting',
      };
    },
  },

  stress: {
    description: 'Stress test — HR increases 70 → 190 progressively',
    getVitals: (i) => {
      const hr   = Math.min(70 + i * 2, 190);
      const spo2 = Math.max(99 - i * 0.3, 82);
      return {
        heart_rate:   Math.round(hr),
        spo2:         parseFloat(spo2.toFixed(1)),
        systolic_bp:  Math.round(120 + i * 0.8),
        diastolic_bp: Math.round(80 + i * 0.3),
        temperature:  parseFloat((36.5 + i * 0.05).toFixed(1)),
        activity_level: hr > 150 ? 'running' : hr > 120 ? 'walking' : 'resting',
      };
    },
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(1));
}

function buildPayload(vitals, readingIndex) {
  return {
    device_id:        DEVICE_ID,
    patient_id:       PATIENT_ID,
    timestamp:        new Date().toISOString(),
    vitals,
    battery_level:    Math.max(95 - readingIndex, 20),
    signal_strength:  randInt(-55, -40),
    firmware_version: '2.1.3',
  };
}

function getAlertLevel(vitals) {
  const { heart_rate: hr, spo2 } = vitals;
  if (hr > 180 || spo2 < 85) return '🔴 LEVEL_3 CRITICAL';
  if (hr > 150 || spo2 < 88) return '🟠 LEVEL_2 URGENT';
  if (hr > 120 || spo2 < 92) return '🟡 LEVEL_1 WARNING';
  return '🟢 NORMAL';
}

// ── Main ───────────────────────────────────────────────────────────────────────
const scenario = SCENARIOS[SCENARIO];
if (!scenario) {
  console.error(`❌ Unknown scenario: "${SCENARIO}". Valid: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}

console.log(`
╔══════════════════════════════════════════════╗
║        HealthSync IoT Simulator              ║
╚══════════════════════════════════════════════╝
  Broker  : ${BROKER_URL}
  Patient : ${PATIENT_ID}
  Device  : ${DEVICE_ID}
  Scenario: ${SCENARIO} — ${scenario.description}
  Interval: ${INTERVAL_MS}ms
  Count   : ${COUNT === 0 ? '∞ infinite' : COUNT}
`);

const topic = `healthsync/devices/${DEVICE_ID}/vitals`;

const client = mqtt.connect(BROKER_URL, {
  clientId:        `hs-simulator-${Date.now()}`,
  clean:           true,
  connectTimeout:  5000,
  reconnectPeriod: 2000,
});

let readingIndex  = 0;
let intervalHandle = null;

client.on('connect', () => {
  console.log(`✅ Connected to MQTT broker: ${BROKER_URL}`);
  console.log(`📡 Publishing to: ${topic}\n`);

  function sendReading() {
    if (COUNT > 0 && readingIndex >= COUNT) {
      console.log(`\n✅ Completed ${COUNT} readings. Disconnecting...`);
      if (intervalHandle) clearInterval(intervalHandle);
      client.end();
      return;
    }

    const vitals     = scenario.getVitals(readingIndex);
    const payload    = buildPayload(vitals, readingIndex);
    const alertLevel = getAlertLevel(vitals);
    const payloadStr = JSON.stringify(payload);

    client.publish(topic, payloadStr, { qos: 1 }, (err) => {
      if (err) {
        console.error(`❌ Publish failed [reading ${readingIndex + 1}]:`, err.message);
      } else {
        console.log(
          `[${new Date().toLocaleTimeString()}] Reading #${String(readingIndex + 1).padStart(3, '0')} ${alertLevel}`
        );
        console.log(
          `   HR: ${vitals.heart_rate}bpm | SpO2: ${vitals.spo2}% | Temp: ${vitals.temperature}°C | BP: ${vitals.systolic_bp}/${vitals.diastolic_bp}mmHg`
        );
      }
    });

    readingIndex++;
  }

  sendReading(); // send immediately on connect
  intervalHandle = setInterval(sendReading, INTERVAL_MS);
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  if (err.message.includes('ECONNREFUSED')) {
    console.error('   Make sure EMQX is running: docker-compose up emqx');
  }
});

client.on('offline', () => {
  console.warn('⚠️  MQTT client offline, attempting reconnect...');
});

client.on('close', () => {
  console.log('🔌 MQTT connection closed.');
  process.exit(0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Interrupted. Disconnecting...');
  if (intervalHandle) clearInterval(intervalHandle);
  client.end(true, () => process.exit(0));
});
