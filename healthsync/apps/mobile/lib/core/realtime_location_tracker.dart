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
  StreamSubscription<Position>? _positionSubscription;
  bool _stopped = false;

  RealtimeLocationTracker({required this.accessToken, required this.entityId, required this.entityType});

  Future<bool> start() async {
    if (_channel != null) return true;
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return false;

    _stopped = false;
    const configuredUrl = String.fromEnvironment('REALTIME_WS_URL');
    final socketUrl = configuredUrl.isNotEmpty ? configuredUrl : 'ws://10.0.2.2:3011/ws';
    _channel = WebSocketChannel.connect(Uri.parse(socketUrl));
    _send('auth', {'token': accessToken, 'entityId': entityId});
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10),
    ).listen(_publishPosition);
    return true;
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
    _channel?.sink.add(jsonEncode({'type': type, 'requestId': DateTime.now().microsecondsSinceEpoch.toString(), 'payload': payload}));
  }

  Future<void> dispose() async {
    _stopped = true;
    await _positionSubscription?.cancel();
    await _channel?.sink.close();
    _positionSubscription = null;
    _channel = null;
  }
}
