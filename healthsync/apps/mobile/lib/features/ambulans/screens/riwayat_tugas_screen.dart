import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_theme.dart';
import '../../../core/models/ambulance_task.dart';
import '../../../core/providers/ambulance_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/section_header.dart';

/// Halaman riwayat tugas ambulans
class RiwayatTugasScreen extends ConsumerStatefulWidget {
  const RiwayatTugasScreen({super.key});

  @override
  ConsumerState<RiwayatTugasScreen> createState() =>
      _RiwayatTugasScreenState();
}

class _RiwayatTugasScreenState extends ConsumerState<RiwayatTugasScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() =>
        ref.read(ambulansProvider.notifier).fetchTugas());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(ambulansProvider);
    final stat = ref.watch(ambulansStatProvider);
    final selesai = state.tugasHistory
        .where((t) => t.status == StatusAmbulans.selesai)
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      appBar: AppBar(
        title: const Text('Riwayat Tugas'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
      ),
      body: Column(
        children: [
          // ── Ringkasan Statistik ────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(AppTheme.sM),
            child: Row(
              children: [
                Expanded(
                  child: _StatBox(
                    label: 'Total Tugas',
                    value: '${stat['total'] ?? 0}',
                    color: AppTheme.info,
                  ),
                ),
                const SizedBox(width: AppTheme.sS),
                Expanded(
                  child: _StatBox(
                    label: 'Selesai',
                    value: '${stat['selesai'] ?? 0}',
                    color: AppTheme.sukses,
                  ),
                ),
                const SizedBox(width: AppTheme.sS),
                Expanded(
                  child: _StatBox(
                    label: 'Darurat',
                    value: '${state.tugasHistory.where((t) => t.prioritas == PrioritasAmbulans.darurat || t.prioritas == PrioritasAmbulans.kritis).length}',
                    color: AppTheme.bahaya,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // ── Daftar Riwayat ────────────────────────────
          Expanded(
            child: state.isLoading
                ? const Center(child: CircularProgressIndicator())
                : selesai.isEmpty
                    ? const EmptyState(
                        icon: Icons.history_rounded,
                        title: 'Belum ada riwayat tugas',
                        subtitle:
                            'Tugas yang sudah selesai akan tampil di sini',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppTheme.sM),
                        itemCount: selesai.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppTheme.sS),
                        itemBuilder: (_, i) {
                          final t = selesai[i];
                          final isDarurat =
                              t.prioritas == PrioritasAmbulans.darurat ||
                              t.prioritas == PrioritasAmbulans.kritis;
                          return HealthCard(
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: (isDarurat
                                            ? AppTheme.bahaya
                                            : AppTheme.abu200)
                                        .withOpacity(
                                            isDarurat ? 0.1 : 1.0),
                                    borderRadius:
                                        BorderRadius.circular(AppTheme.rS),
                                  ),
                                  child: Icon(
                                    Icons.emergency_rounded,
                                    size: 18,
                                    color: isDarurat
                                        ? AppTheme.bahaya
                                        : AppTheme.abu500,
                                  ),
                                ),
                                const SizedBox(width: AppTheme.sM),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(t.pasienNama,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 14)),
                                      Text(
                                        t.tujuanRS,
                                        style: const TextStyle(
                                            fontSize: 12,
                                            color: AppTheme.abu500),
                                      ),
                                      Text(
                                        _formatTanggal(t.createdAt),
                                        style: const TextStyle(
                                            fontSize: 11,
                                            color: AppTheme.abu500),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.end,
                                  children: [
                                    StatusBadge.auto(t.status),
                                    if (isDarurat) ...[
                                      const SizedBox(height: 4),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: AppTheme.bahaya
                                              .withOpacity(0.10),
                                          borderRadius:
                                              BorderRadius.circular(10),
                                        ),
                                        child: const Text(
                                          'DARURAT',
                                          style: TextStyle(
                                              fontSize: 9,
                                              fontWeight: FontWeight.w800,
                                              color: AppTheme.bahaya),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  String _formatTanggal(DateTime dt) {
    final bulan = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    return '${dt.day} ${bulan[dt.month]} ${dt.year}';
  }
}

class _StatBox extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatBox(
      {required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          vertical: AppTheme.sM, horizontal: AppTheme.sS),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(AppTheme.rS),
      ),
      child: Column(
        children: [
          Text(value,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: color)),
          Text(label,
              style: const TextStyle(
                  fontSize: 11, color: AppTheme.abu500)),
        ],
      ),
    );
  }
}
