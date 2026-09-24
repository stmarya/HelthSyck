import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/vitals.dart';
import '../core/providers/auth_provider.dart';
import '../core/providers/vitals_provider.dart';

class VitalsScreen extends ConsumerStatefulWidget {
  const VitalsScreen({super.key});

  @override
  ConsumerState<VitalsScreen> createState() => _VitalsScreenState();
}

class _VitalsScreenState extends ConsumerState<VitalsScreen> {
  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    final patientId = user?.patientId ?? user?.id ?? '';
    if (patientId.isNotEmpty) {
      ref.read(vitalsProvider.notifier).connect(patientId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final vitalsState = ref.watch(vitalsProvider);
    final latest = vitalsState.latest;
    final history = vitalsState.history;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Live Vitals'),
        actions: [
          // Connection status indicator
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Icon(
              vitalsState.connected
                  ? Icons.wifi_rounded
                  : Icons.wifi_off_rounded,
              color: vitalsState.connected ? Colors.green : Colors.red,
            ),
          ),
        ],
      ),
      body: vitalsState.error != null
          ? _ErrorView(error: vitalsState.error!)
          : latest == null
              ? const _WaitingView()
              : _VitalsContent(
                  latest: latest,
                  history: history,
                  theme: theme,
                ),
    );
  }
}

// ─────────────────────────────────────────────
// Vitals content — metric cards + charts
// ─────────────────────────────────────────────

class _VitalsContent extends StatelessWidget {
  final VitalsReading latest;
  final List<VitalsReading> history;
  final ThemeData theme;

  const _VitalsContent({
    required this.latest,
    required this.history,
    required this.theme,
  });

  Color _alertColor(String level) {
    switch (level) {
      case 'critical':
        return Colors.red;
      case 'level2':
        return Colors.orange;
      case 'level1':
        return Colors.yellow.shade700;
      default:
        return Colors.green;
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Alert banner
          if (latest.alertLevel != 'normal')
            _AlertBanner(
              level: latest.alertLevel,
              color: _alertColor(latest.alertLevel),
            ),

          // Metric cards
          Row(
            children: [
              Expanded(
                child: _MetricCard(
                  label: 'Heart Rate',
                  value: '${latest.heartRate.toStringAsFixed(0)}',
                  unit: 'bpm',
                  icon: Icons.favorite_rounded,
                  color: Colors.red,
                  normal: latest.heartRate >= 60 && latest.heartRate <= 100,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricCard(
                  label: 'SpO₂',
                  value: '${latest.spo2.toStringAsFixed(1)}',
                  unit: '%',
                  icon: Icons.water_drop_rounded,
                  color: Colors.blue,
                  normal: latest.spo2 >= 95,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MetricCard(
                  label: 'Blood Pressure',
                  value:
                      '${latest.systolic.toStringAsFixed(0)}/${latest.diastolic.toStringAsFixed(0)}',
                  unit: 'mmHg',
                  icon: Icons.monitor_heart_rounded,
                  color: Colors.purple,
                  normal: latest.systolic < 140 && latest.diastolic < 90,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricCard(
                  label: 'Temperature',
                  value: '${latest.temperature.toStringAsFixed(1)}',
                  unit: '°C',
                  icon: Icons.thermostat_rounded,
                  color: Colors.orange,
                  normal:
                      latest.temperature >= 36.1 && latest.temperature <= 37.5,
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // Heart rate trend chart
          if (history.length > 2) ...[
            Text(
              'Heart Rate Trend',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 180,
              child: _HeartRateChart(history: history),
            ),
            const SizedBox(height: 24),
            Text(
              'SpO₂ Trend',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 180,
              child: _Spo2Chart(history: history),
            ),
          ],

          const SizedBox(height: 16),
          // Timestamp
          Text(
            'Last update: ${_formatTime(latest.timestamp)}',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')}';
  }
}

// ─────────────────────────────────────────────
// Widget components
// ─────────────────────────────────────────────

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final String unit;
  final IconData icon;
  final Color color;
  final bool normal;

  const _MetricCard({
    required this.label,
    required this.value,
    required this.unit,
    required this.icon,
    required this.color,
    required this.normal,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: 6),
                Text(label, style: theme.textTheme.bodySmall),
                const Spacer(),
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: normal ? Colors.green : Colors.red,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  value,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                const SizedBox(width: 4),
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    unit,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AlertBanner extends StatelessWidget {
  final String level;
  final Color color;

  const _AlertBanner({required this.level, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_rounded, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Alert Level: ${level.toUpperCase()} — Abnormal vitals detected',
              style: TextStyle(
                  color: color.withOpacity(0.9), fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeartRateChart extends StatelessWidget {
  final List<VitalsReading> history;
  const _HeartRateChart({required this.history});

  @override
  Widget build(BuildContext context) {
    final spots = history.asMap().entries.map((e) {
      return FlSpot(e.key.toDouble(), e.value.heartRate);
    }).toList();

    return LineChart(
      LineChartData(
        gridData: const FlGridData(show: false),
        titlesData: const FlTitlesData(show: false),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            color: Colors.red,
            barWidth: 2,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: Colors.red.withOpacity(0.08),
            ),
          ),
        ],
      ),
    );
  }
}

class _Spo2Chart extends StatelessWidget {
  final List<VitalsReading> history;
  const _Spo2Chart({required this.history});

  @override
  Widget build(BuildContext context) {
    final spots = history.asMap().entries.map((e) {
      return FlSpot(e.key.toDouble(), e.value.spo2);
    }).toList();

    return LineChart(
      LineChartData(
        gridData: const FlGridData(show: false),
        titlesData: const FlTitlesData(show: false),
        borderData: FlBorderData(show: false),
        minY: 90,
        maxY: 100,
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            color: Colors.blue,
            barWidth: 2,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: Colors.blue.withOpacity(0.08),
            ),
          ),
        ],
      ),
    );
  }
}

class _WaitingView extends StatelessWidget {
  const _WaitingView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Waiting for vitals data...'),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String error;
  const _ErrorView({required this.error});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 48),
          const SizedBox(height: 16),
          Text(
            error,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.red),
          ),
        ],
      ),
    );
  }
}
