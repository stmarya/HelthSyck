import 'dart:async';
import 'dart:convert';

import 'package:geolocator/geolocator.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Publishes authenticated device GPS updates to the realtime gateway.
/// Configure production with --dart-define=REALTIME_WS_URL=wss://realtime.healthsync.id/ws
class RealtimeLocationTracker {
  final String accessToken;
  final String entityId;
  final String entityType;
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _socketSubscription;
  StreamSubscription<Position>? _positionSubscription;
  Timer? _reconnectTimer;
  bool _stopped = false;
  bool _authenticated = false;
  int _reconnectDelaySeconds = 1;

  RealtimeLocationTracker({required this.accessToken, required this.entityId, required this.entityType});

  Future<bool> start() async {
    if (_channel != null) return true;
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return false;

    _stopped = false;
    await _connectSocket();
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10),
    ).listen(_publishPosition);
    return true;
  }

  Future<void> _connectSocket() async {
    if (_stopped) return;
    const configuredUrl = String.fromEnvironment('REALTIME_WS_URL');
    final socketUrl = configuredUrl.isNotEmpty ? configuredUrl : 'ws://10.0.2.2:3011/ws';
    _authenticated = false;
    try {
      await _socketSubscription?.cancel();
      await _channel?.sink.close();
      _channel = WebSocketChannel.connect(Uri.parse(socketUrl));
      _socketSubscription = _channel!.stream.listen((raw) {
        try {
          final event = jsonDecode(raw.toString()) as Map<String, dynamic>;
          if (event['type'] == 'auth.ok') {
            _authenticated = true;
            _reconnectDelaySeconds = 1;
          }
          if (event['type'] == 'auth.error') {
            _stopped = true;
            _reconnectTimer?.cancel();
            final subscription = _positionSubscription;
            if (subscription != null) unawaited(subscription.cancel());
          }
        } catch (_) {
          // Ignore malformed server frames; location publishing remains guarded.
        }
      }, onDone: _scheduleReconnect, onError: (_, __) => _scheduleReconnect());
      _send('auth', {'token': accessToken, 'entityId': entityId});
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_stopped || _reconnectTimer != null) return;
    final delay = _reconnectDelaySeconds;
    _reconnectDelaySeconds = _reconnectDelaySeconds < 15 ? _reconnectDelaySeconds * 2 : 15;
    _reconnectTimer = Timer(Duration(seconds: delay), () {
      _reconnectTimer = null;
      unawaited(_connectSocket());
    });
  }

  void _publishPosition(Position position) {
    if (_stopped) return;
    _send('location.update', {
      'entityId': entityId,
      'entityType': entityType,
      'latitude': position.latitude,
      'longitude': position.longitude,
      'accuracyM': position.accuracy,
      'heading': position.heading,
      'speedKmh': position.speed < 0 ? 0 : position.speed * 3.6,
    });
  }

  void _send(String type, Map<String, Object?> payload) {
    if (type != 'auth' && !_authenticated) return;
    try {
      _channel?.sink.add(jsonEncode({'type': type, 'requestId': DateTime.now().microsecondsSinceEpoch.toString(), 'payload': payload}));
    } catch (_) {
      _scheduleReconnect();
    }
  }

  Future<void> dispose() async {
    _stopped = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    await _positionSubscription?.cancel();
    await _socketSubscription?.cancel();
    await _channel?.sink.close();
    _positionSubscription = null;
    _socketSubscription = null;
    _channel = null;
  }
}
