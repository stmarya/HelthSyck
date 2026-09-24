import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/providers/auth_provider.dart';

// ─── Model ───────────────────────────────────────────────────────────────────

class AmbulanceUnit {
  final String id;
  final String licensePlate;
  final String status;
  final double? latitude;
  final double? longitude;
  final String? crewName;
  final String? vehicleType;

  const AmbulanceUnit({
    required this.id,
    required this.licensePlate,
    required this.status,
    this.latitude,
    this.longitude,
    this.crewName,
    this.vehicleType,
  });

  factory AmbulanceUnit.fromJson(Map<String, dynamic> json) => AmbulanceUnit(
        id: json['id'] as String,
        licensePlate: json['licensePlate'] as String? ?? '',
        status: json['status'] as String? ?? 'UNKNOWN',
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        crewName: json['crewName'] as String?,
        vehicleType: json['vehicleType'] as String?,
      );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

class AmbulanceScreen extends ConsumerStatefulWidget {
  const AmbulanceScreen({super.key});

  @override
  ConsumerState<AmbulanceScreen> createState() => _AmbulanceScreenState();
}

class _AmbulanceScreenState extends ConsumerState<AmbulanceScreen> {
  List<AmbulanceUnit> _ambulances = [];
  bool _loading = true;
  String? _error;
  bool _dispatching = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final token = ref.read(authProvider).accessToken;
      final client = ApiClient();
      final res = await client.get(
        '/v1/ambulances',
        port: 3005,
        token: token,
      );
      final data = (res['data'] as List<dynamic>? ?? [])
          .map((e) => AmbulanceUnit.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() => _ambulances = data);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _requestAmbulance() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Request Ambulance'),
        content: const Text(
            'Are you sure you want to dispatch an emergency ambulance to your location?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Dispatch Emergency',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _dispatching = true);
    try {
      final token = ref.read(authProvider).accessToken;
      final user = ref.read(authProvider).user;
      final client = ApiClient();
      await client.post(
        '/v1/ambulances/dispatch',
        port: 3005,
        token: token,
        body: {
          'patientId': user?.patientId ?? '',
          'priority': 'EMERGENCY',
          'notes': 'Patient-requested emergency dispatch via mobile app',
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Ambulance dispatched! Help is on the way.'),
            backgroundColor: Colors.green,
          ),
        );
      }
      await _fetch();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to dispatch: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _dispatching = false);
    }
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'AVAILABLE':
        return Colors.green;
      case 'DISPATCHED':
      case 'EN_ROUTE':
        return Colors.orange;
      case 'ON_SCENE':
      case 'TRANSPORTING':
        return Colors.red;
      case 'RETURNING':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final available =
        _ambulances.where((a) => a.status == 'AVAILABLE').length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ambulance Services'),
        backgroundColor: Colors.red.shade700,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetch,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline,
                          size: 48, color: Colors.red),
                      const SizedBox(height: 12),
                      Text(_error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                          onPressed: _fetch,
                          child: const Text('Retry')),
                    ],
                  ),
                )
              : Column(
                  children: [
                    // ── Emergency banner ──────────────────────────────────
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      color: Colors.red.shade50,
                      child: Column(
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.emergency,
                                  color: Colors.red, size: 28),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    const Text('Emergency Services',
                                        style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 16)),
                                    Text(
                                      '$available ambulance${available != 1 ? 's' : ''} available',
                                      style: TextStyle(
                                          color: available > 0
                                              ? Colors.green
                                              : Colors.red,
                                          fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed:
                                  _dispatching ? null : _requestAmbulance,
                              icon: _dispatching
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white))
                                  : const Icon(Icons.local_hospital),
                              label: Text(_dispatching
                                  ? 'Dispatching...'
                                  : 'Request Emergency Ambulance'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.red,
                                foregroundColor: Colors.white,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(8)),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'For life-threatening emergencies only',
                            style:
                                TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                        ],
                      ),
                    ),

                    // ── Fleet list ────────────────────────────────────────
                    Expanded(
                      child: _ambulances.isEmpty
                          ? const Center(
                              child: Text('No ambulances registered',
                                  style: TextStyle(
                                      color: Colors.grey, fontSize: 16)),
                            )
                          : RefreshIndicator(
                              onRefresh: _fetch,
                              child: ListView.builder(
                                padding: const EdgeInsets.all(16),
                                itemCount: _ambulances.length,
                                itemBuilder: (ctx, i) {
                                  final a = _ambulances[i];
                                  return Card(
                                    margin: const EdgeInsets.only(bottom: 8),
                                    child: ListTile(
                                      leading: CircleAvatar(
                                        backgroundColor: _statusColor(a.status)
                                            .withOpacity(0.12),
                                        child: Icon(Icons.local_taxi,
                                            color: _statusColor(a.status)),
                                      ),
                                      title: Text(a.licensePlate,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontFamily: 'monospace')),
                                      subtitle: Text(a.crewName != null
                                          ? 'Crew: ${a.crewName}'
                                          : 'No crew assigned'),
                                      trailing: Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: _statusColor(a.status)
                                              .withOpacity(0.12),
                                          borderRadius:
                                              BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          a.status.replaceAll('_', ' '),
                                          style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.bold,
                                              color: _statusColor(a.status)),
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }
}
