import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../widgets/doctor_ui.dart';

class RiwayatDokterScreen extends ConsumerStatefulWidget {
  const RiwayatDokterScreen({super.key});

  @override
  ConsumerState<RiwayatDokterScreen> createState() => _RiwayatDokterScreenState();
}

class _RiwayatDokterScreenState extends ConsumerState<RiwayatDokterScreen> {
  List<Map<String, dynamic>> _items = const [];
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
        '/v1/consultations?status=COMPLETED&limit=50',
        port: 3003,
      );
      final raw = response['data'];
      if (!mounted) return;
      setState(() {
        _items = raw is List
            ? raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
            : const [];
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
        _error = 'Gagal memuat riwayat konsultasi.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DoctorUi.canvas,
      appBar: AppBar(
        backgroundColor: DoctorUi.canvas,
        title: const Text('Riwayat konsultasi'),
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
                        child: Text(_error!, style: TextStyle(color: Colors.red.shade800)),
                      ),
                    ),
                  if (_items.isEmpty)
                    const Card(child: ListTile(title: Text('Belum ada konsultasi selesai.')))
                  else
                    ..._items.map(
                      (item) => Card(
                        child: ListTile(
                          leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                          title: Text(item['patient_name']?.toString() ?? 'Pasien'),
                          subtitle: Text(
                            '${item['chief_complaint'] ?? '-'}\n'
                            'Prioritas: ${item['urgency'] ?? 'NORMAL'} • '
                            'Selesai: ${item['ended_at'] ?? '-'}\n'
                            'Diagnosis: ${item['diagnosis'] ?? 'Belum dicatat'}\n'
                            'Catatan: ${item['notes'] ?? 'Belum dicatat'}',
                          ),
                          isThreeLine: true,
                          trailing: const Icon(Icons.chevron_right),
                          onTap: item['id'] == null
                              ? null
                              : () => context.push('/doctor/consultations/${item['id']}'),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}