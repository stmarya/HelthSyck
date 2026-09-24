import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_theme.dart';
import '../../../core/providers/pharmacy_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/section_header.dart';

/// Halaman riwayat transaksi resep untuk Apotek
class HistoryApotekScreen extends ConsumerStatefulWidget {
  const HistoryApotekScreen({super.key});

  @override
  ConsumerState<HistoryApotekScreen> createState() =>
      _HistoryApotekScreenState();
}

class _HistoryApotekScreenState extends ConsumerState<HistoryApotekScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(resepProvider.notifier).fetchResep());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(resepProvider);
    final selesai = state.items
        .where((r) => r.status == 'COMPLETED' || r.status == 'CANCELLED')
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      appBar: AppBar(
        title: const Text('Riwayat Resep'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
      ),
      body: Column(
        children: [
          // ── Ringkasan ─────────────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(AppTheme.sM),
            child: Row(
              children: [
                Expanded(
                  child: _SummaryChip(
                    label: 'Total Resep',
                    value: '${state.items.length}',
                    color: AppTheme.info,
                  ),
                ),
                const SizedBox(width: AppTheme.sS),
                Expanded(
                  child: _SummaryChip(
                    label: 'Selesai',
                    value: '${selesai.where((r) => r.status == "COMPLETED").length}',
                    color: AppTheme.sukses,
                  ),
                ),
                const SizedBox(width: AppTheme.sS),
                Expanded(
                  child: _SummaryChip(
                    label: 'Dibatalkan',
                    value: '${selesai.where((r) => r.status == "CANCELLED").length}',
                    color: AppTheme.bahaya,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // ── Daftar Riwayat ────────────────────────────────
          Expanded(
            child: state.isLoading
                ? const Center(child: CircularProgressIndicator())
                : selesai.isEmpty
                    ? const EmptyState(
                        icon: Icons.history_rounded,
                        title: 'Belum ada riwayat',
                        subtitle:
                            'Resep yang sudah selesai atau dibatalkan akan muncul di sini',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppTheme.sM),
                        itemCount: selesai.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppTheme.sS),
                        itemBuilder: (_, i) {
                          final r = selesai[i];
                          return HealthCard(
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: AppTheme.abu200,
                                    borderRadius: BorderRadius.circular(
                                        AppTheme.rS),
                                  ),
                                  child: const Icon(Icons.receipt_rounded,
                                      size: 18, color: AppTheme.abu500),
                                ),
                                const SizedBox(width: AppTheme.sM),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(r.pasienNama,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 14)),
                                      Text(
                                        '${r.items.length} obat · dr. ${r.dokterNama}',
                                        style: const TextStyle(
                                            fontSize: 12,
                                            color: AppTheme.abu500),
                                      ),
                                      Text(
                                        _formatTanggal(r.createdAt),
                                        style: const TextStyle(
                                            fontSize: 11,
                                            color: AppTheme.abu500),
                                      ),
                                    ],
                                  ),
                                ),
                                StatusBadge.auto(r.status),
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

class _SummaryChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _SummaryChip({
    required this.label,
    required this.value,
    required this.color,
  });

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
          Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppTheme.abu500),
          ),
        ],
      ),
    );
  }
}
