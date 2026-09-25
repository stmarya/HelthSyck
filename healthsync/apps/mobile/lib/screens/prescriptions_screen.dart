import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_client.dart';
import '../core/providers/auth_provider.dart';

// ─── Model ───────────────────────────────────────────────────────────────────

class Prescription {
  final String id;
  final String consultationId;
  final String status;
  final List<PrescriptionItem> items;
  final DateTime? createdAt;
  final String? pharmacyName;

  const Prescription({
    required this.id,
    required this.consultationId,
    required this.status,
    required this.items,
    this.createdAt,
    this.pharmacyName,
  });

  factory Prescription.fromJson(Map<String, dynamic> json) => Prescription(
        id: json['id'] as String,
        consultationId: json['consultation_id'] as String? ?? '',
        status: json['status'] as String? ?? 'ISSUED',
        items: (json['items'] as List<dynamic>? ?? [])
            .map((e) => PrescriptionItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        createdAt: json['issued_at'] != null
            ? DateTime.tryParse(json['issued_at'] as String)
            : null,
        pharmacyName: json['pharmacyName'] as String?,
      );
}

class PrescriptionItem {
  final String drugName;
  final String dosage;
  final int quantity;
  final String? instructions;

  const PrescriptionItem({
    required this.drugName,
    required this.dosage,
    required this.quantity,
    this.instructions,
  });

  factory PrescriptionItem.fromJson(Map<String, dynamic> json) =>
      PrescriptionItem(
        drugName: json['drug_name'] as String? ?? '',
        dosage: json['dosage'] as String? ?? '',
        quantity: (json['quantity'] as num?)?.toInt() ?? 0,
        instructions: json['instructions'] as String?,
      );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

class PrescriptionsScreen extends ConsumerStatefulWidget {
  const PrescriptionsScreen({super.key});

  @override
  ConsumerState<PrescriptionsScreen> createState() =>
      _PrescriptionsScreenState();
}

class _PrescriptionsScreenState
    extends ConsumerState<PrescriptionsScreen> {
  List<Prescription> _prescriptions = [];
  bool _loading = true;
  String? _error;

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
        '/v1/prescriptions',
        port: 3004,
        token: token,
      );
      final data = (res['data'] as List<dynamic>? ?? [])
          .map((e) => Prescription.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() => _prescriptions = data);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'CONFIRMED':
      case 'READY':
      case 'DELIVERING':
      case 'DELIVERED':
        return Colors.green;
      case 'ISSUED':
      case 'SENT_TO_PHARMACY':
      case 'PREPARING':
        return Colors.orange;
      case 'CANCELLED':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Prescriptions'),
        backgroundColor: const Color(0xFF1976D2),
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
              : _prescriptions.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.medication_outlined,
                              size: 64, color: Colors.grey),
                          SizedBox(height: 12),
                          Text('No prescriptions yet',
                              style: TextStyle(
                                  color: Colors.grey, fontSize: 16)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _fetch,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _prescriptions.length,
                        itemBuilder: (ctx, i) {
                          final rx = _prescriptions[i];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ExpansionTile(
                              leading: const Icon(Icons.medication,
                                  color: Color(0xFF1976D2)),
                              title: Text(
                                rx.pharmacyName ?? 'Prescription',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600),
                              ),
                              subtitle: Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _statusColor(rx.status)
                                          .withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text(
                                      rx.status,
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: _statusColor(rx.status),
                                          fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  if (rx.createdAt != null)
                                    Text(
                                      '${rx.createdAt!.day}/${rx.createdAt!.month}/${rx.createdAt!.year}',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey),
                                    ),
                                ],
                              ),
                              children: rx.items.map((item) {
                                return ListTile(
                                  dense: true,
                                  leading:
                                      const Icon(Icons.circle, size: 8),
                                  title: Text(item.drugName,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w500)),
                                  subtitle: Text(
                                      '${item.dosage} • Jumlah ${item.quantity}'
                                      '${item.instructions != null && item.instructions!.isNotEmpty ? ' • ${item.instructions}' : ''}'),
                                );
                              }).toList(),
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/consultations'),
        icon: const Icon(Icons.add),
        label: const Text('New Consultation'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
      ),
    );
  }
}
