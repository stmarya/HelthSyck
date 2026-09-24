import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

import '../models/vitals.dart';
import '../providers/auth_provider.dart';

// ─────────────────────────────────────────────
// Vitals history state
// ─────────────────────────────────────────────

class VitalsState {
  final List<VitalsReading> history;
  final VitalsReading? latest;
  final bool connected;
  final String? error;

  const VitalsState({
    this.history = const [],
    this.latest,
    this.connected = false,
    this.error,
  });

  VitalsState copyWith({
    List<VitalsReading>? history,
    VitalsReading? latest,
    bool? connected,
    String? error,
  }) {
    return VitalsState(
      history: history ?? this.history,
      latest: latest ?? this.latest,
      connected: connected ?? this.connected,
      error: error,
    );
  }
}

// ─────────────────────────────────────────────
// Vitals notifier — MQTT subscriber
// ─────────────────────────────────────────────

class VitalsNotifier extends StateNotifier<VitalsState> {
  final Ref _ref;
  final Logger _log;
  MqttServerClient? _client;
  StreamSubscription? _sub;

  static const _maxHistory = 60; // keep last 60 readings (~5 min at 5s interval)
  static const _mqttBroker = String.fromEnvironment(
    'MQTT_BROKER',
    defaultValue: 'localhost',
  );
  static const _mqttPort = 1883;

  VitalsNotifier(this._ref, this._log) : super(const VitalsState());

  // ── Connect to MQTT broker ──────────────────────

  Future<void> connect(String patientId) async {
    await _disconnect();

    final user = _ref.read(authProvider).user;
    if (user == null) return;

    final clientId = 'hs-mobile-${user.id}-${DateTime.now().millisecondsSinceEpoch}';
    _client = MqttServerClient(_mqttBroker, clientId)
      ..port = _mqttPort
      ..keepAlivePeriod = 30
      ..logging(on: false)
      ..autoReconnect = true
      ..onDisconnected = _onDisconnected
      ..onConnected = _onConnected;

    try {
      final connMessage = MqttConnectMessage()
          .withClientIdentifier(clientId)
          .startClean()
          .withWillQos(MqttQos.atLeastOnce);
      _client!.connectionMessage = connMessage;

      await _client!.connect();

      // Subscribe to patient-specific vitals topic
      final topic = 'hs/vitals/$patientId';
      _client!.subscribe(topic, MqttQos.atLeastOnce);

      // Also subscribe to alerts for this patient
      _client!.subscribe('hs/alerts/$patientId', MqttQos.atLeastOnce);

      _sub = _client!.updates!.listen(_onMessage);
      _log.i('MQTT connected, subscribed to $topic');
    } catch (e) {
      _log.e('MQTT connect error: $e');
      state = state.copyWith(connected: false, error: e.toString());
    }
  }

  void _onConnected() {
    state = state.copyWith(connected: true, error: null);
  }

  void _onDisconnected() {
    state = state.copyWith(connected: false);
    _log.w('MQTT disconnected');
  }

  void _onMessage(List<MqttReceivedMessage<MqttMessage>> events) {
    for (final event in events) {
      final msg = event.payload as MqttPublishMessage;
      final payload = MqttPublishPayload.bytesToStringAsString(
        msg.payload.message,
      );

      try {
        final json = jsonDecode(payload) as Map<String, dynamic>;
        final topic = event.topic;

        if (topic.startsWith('hs/vitals/')) {
          _handleVitals(json);
        } else if (topic.startsWith('hs/alerts/')) {
          _handleAlert(json);
        }
      } catch (e) {
        _log.e('MQTT message parse error: $e');
      }
    }
  }

  void _handleVitals(Map<String, dynamic> json) {
    final reading = VitalsReading.fromJson(json);
    final newHistory = [...state.history, reading];
    if (newHistory.length > _maxHistory) {
      newHistory.removeAt(0);
    }
    state = state.copyWith(history: newHistory, latest: reading);
  }

  void _handleAlert(Map<String, dynamic> json) {
    // Alert is processed separately via alertsProvider
    _log.w('Alert received: ${json['alertLevel']} for ${json['metric']}');
  }

  Future<void> _disconnect() async {
    await _sub?.cancel();
    _sub = null;
    _client?.disconnect();
    _client = null;
  }

  @override
  void dispose() {
    _disconnect();
    super.dispose();
  }
}

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────

final vitalsProvider = StateNotifierProvider<VitalsNotifier, VitalsState>(
  (ref) => VitalsNotifier(
    ref,
    Logger(printer: PrettyPrinter(methodCount: 0)),
  ),
);

/// Derived provider: latest vitals reading only
final latestVitalsProvider = Provider<VitalsReading?>(
  (ref) => ref.watch(vitalsProvider).latest,
);

/// Derived provider: vitals history for charting
final vitalsHistoryProvider = Provider<List<VitalsReading>>(
  (ref) => ref.watch(vitalsProvider).history,
);
