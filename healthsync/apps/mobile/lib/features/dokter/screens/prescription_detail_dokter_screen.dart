import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../widgets/doctor_ui.dart';

class PrescriptionDetailDokterScreen extends ConsumerStatefulWidget {
  final String prescriptionId;

  const PrescriptionDetailDokterScreen({
    super.key,
    required this.prescriptionId,
  });

  @override
  ConsumerState<PrescriptionDetailDokterScreen> createState() =>
      _PrescriptionDetailDokterScreenState();
}

class _PrescriptionDetailDokterScreenState
    extends ConsumerState<PrescriptionDetailDokterScreen> {
  Map<String, dynamic>? _prescription;
  bool _loading = true;
  String? _error;

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.get(
        '/v1/prescriptions/${widget.prescriptionId}',
        port: 3004,
      );
      if (!mounted) return;
      setState(() {
        _prescription = response['data'] as Map<String, dynamic>?;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.detail;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Gagal memuat detail resep.';
      });
    }
  }

  List<Map<String, dynamic>> _items(dynamic value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final prescription = _prescription ?? const <String, dynamic>{};
    final items = _items(prescription['items']);
    return Scaffold(
      backgroundColor: DoctorUi.canvas,
      appBar: AppBar(
        backgroundColor: DoctorUi.canvas,
        title: const Text('Detail resep'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Card(
                      color: Colors.red.shade50,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          _error!,
                          style: TextStyle(color: Colors.red.shade800),
                        ),
                      ),
                    ),
                  _Section(
                    title: 'Informasi resep',
                    icon: Icons.receipt_long,
                    children: [
                      _Row(label: 'Status', value: prescription['status']),
                      _Row(label: 'Pasien', value: prescription['patient_name']),
                      _Row(label: 'Dokter', value: prescription['doctor_email']),
                      _Row(label: 'Diterbitkan', value: prescription['issued_at']),
                      _Row(label: 'Berlaku sampai', value: prescription['expires_at']),
                      _Row(label: 'Apotek ID', value: prescription['pharmacy_id']),
                      _Row(label: 'Metode pemenuhan', value: prescription['fulfillment_type']),
                      _Row(label: 'Catatan', value: prescription['notes']),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _Section(
                    title: 'Obat (${items.length})',
                    icon: Icons.medication_outlined,
                    children: items.isEmpty
                        ? [const Text('Tidak ada item obat yang tercatat.')]
                        : items
                            .map(
                              (item) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(
                                  item['generic_name']?.toString() ??
                                      item['drug_name']?.toString() ??
                                      'Obat',
                                ),
                                subtitle: Text(
                                  _join([
                                    item['brand_name'],
                                    item['dosage_form'],
                                    item['strength'],
                                    'Dosis: ${item['dosage'] ?? '-'}',
                                    'Jumlah: ${item['quantity'] ?? '-'}',
                                    item['instructions'] == null
                                        ? null
                                        : 'Instruksi: ${item['instructions']}',
                                  ]),
                                ),
                              ),
                            )
                            .toList(),
                  ),
                ],
              ),
            ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<Widget> children;

  const _Section({
    required this.title,
    required this.icon,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text(title, style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final dynamic value;

  const _Row({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final text = value?.toString().trim();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text('$label: ${text == null || text.isEmpty ? '-' : text}'),
    );
  }
}

String _join(Iterable<dynamic> values) => values
    .map((value) => value?.toString().trim() ?? '')
    .where((value) => value.isNotEmpty)
    .join(' • ');