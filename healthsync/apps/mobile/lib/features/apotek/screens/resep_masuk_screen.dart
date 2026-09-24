import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_theme.dart';
import '../../../core/models/pharmacy.dart';
import '../../../core/providers/pharmacy_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/section_header.dart';

/// Halaman daftar resep masuk untuk Apotek
class ResepMasukScreen extends ConsumerStatefulWidget {
  const ResepMasukScreen({super.key});

  @override
  ConsumerState<ResepMasukScreen> createState() => _ResepMasukScreenState();
}

class _ResepMasukScreenState extends ConsumerState<ResepMasukScreen> {
  String _filterStatus = 'SEMUA';

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(resepProvider.notifier).fetchResep());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(resepProvider);
    final filtered = _filterStatus == 'SEMUA'
        ? state.items
        : state.items.where((r) => r.status == _filterStatus).toList();

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      appBar: AppBar(
        title: const Text('Resep Masuk'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.read(resepProvider.notifier).fetchResep(),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Filter Chips ──────────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.sM,
              vertical: AppTheme.sS,
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  'SEMUA',
                  StatusResep.menunggu,
                  StatusResep.diproses,
                  StatusResep.siap,
                  StatusResep.selesai,
                ].map((s) {
                  final active = _filterStatus == s;
                  final label = _labelFilter(s);
                  return Padding(
                    padding: const EdgeInsets.only(right: AppTheme.sS),
                    child: FilterChip(
                      label: Text(label),
                      selected: active,
                      onSelected: (_) =>
                          setState(() => _filterStatus = s),
                      selectedColor: Theme.of(context)
                          .colorScheme
                          .primary
                          .withOpacity(0.15),
                      checkmarkColor:
                          Theme.of(context).colorScheme.primary,
                      labelStyle: TextStyle(
                        fontWeight: active
                            ? FontWeight.w700
                            : FontWeight.w500,
                        fontSize: 13,
                        color: active
                            ? Theme.of(context).colorScheme.primary
                            : AppTheme.abu700,
                      ),
                      backgroundColor: AppTheme.abu200,
                      side: BorderSide.none,
                      shape: const StadiumBorder(),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const Divider(height: 1),

          // ── Daftar Resep ─────────────────────────────────
          Expanded(
            child: state.isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? EmptyState(
                        icon: Icons.receipt_long_rounded,
                        title: 'Tidak ada resep',
                        subtitle: _filterStatus == 'SEMUA'
                            ? 'Belum ada resep masuk saat ini'
                            : 'Tidak ada resep dengan status ini',
                        actionLabel: 'Muat Ulang',
                        onAction: () =>
                            ref.read(resepProvider.notifier).fetchResep(),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppTheme.sM),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppTheme.sS),
                        itemBuilder: (_, i) => _ResepTile(
                          resep: filtered[i],
                          onUpdateStatus: (status) {
                            ref
                                .read(resepProvider.notifier)
                                .updateStatusResep(filtered[i].id, status);
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  String _labelFilter(String s) {
    switch (s) {
      case 'SEMUA':     return 'Semua';
      case 'PENDING':   return 'Menunggu';
      case 'PROCESSING': return 'Diproses';
      case 'READY':     return 'Siap';
      case 'COMPLETED': return 'Selesai';
      default:          return s;
    }
  }
}

class _ResepTile extends StatelessWidget {
  final ResepMasuk resep;
  final void Function(String) onUpdateStatus;

  const _ResepTile({required this.resep, required this.onUpdateStatus});

  @override
  Widget build(BuildContext context) {
    return HealthCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      resep.pasienNama,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      'dr. ${resep.dokterNama}',
                      style: const TextStyle(
                          fontSize: 12, color: AppTheme.abu500),
                    ),
                  ],
                ),
              ),
              StatusBadge.auto(resep.status),
            ],
          ),

          const Divider(height: AppTheme.sM + AppTheme.sS),

          // ── Items Obat ────────────────────────────────────
          SectionHeader(
            title: 'Daftar Obat',
            subtitle: '${resep.items.length} item',
          ),
          const SizedBox(height: AppTheme.sS),
          ...resep.items.map((item) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    const Icon(Icons.circle, size: 6, color: AppTheme.abu500),
                    const SizedBox(width: AppTheme.sS),
                    Expanded(
                      child: Text(
                        '${item.namaObat} ${item.jumlah} ${item.satuan}',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    Text(
                      item.aturanPakai,
                      style: const TextStyle(
                          fontSize: 11, color: AppTheme.abu500),
                    ),
                  ],
                ),
              )),

          if (resep.catatanDokter != null) ...[
            const SizedBox(height: AppTheme.sS),
            Container(
              padding: const EdgeInsets.all(AppTheme.sS),
              decoration: BoxDecoration(
                color: AppTheme.abu100,
                borderRadius: BorderRadius.circular(AppTheme.rS),
              ),
              child: Row(
                children: [
                  const Icon(Icons.note_rounded,
                      size: 14, color: AppTheme.abu500),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      resep.catatanDokter!,
                      style: const TextStyle(
                          fontSize: 12, color: AppTheme.abu700),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: AppTheme.sM),

          // ── Tombol Aksi ───────────────────────────────────
          if (resep.status == StatusResep.menunggu)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => onUpdateStatus(StatusResep.diproses),
                icon: const Icon(Icons.play_arrow_rounded, size: 18),
                label: const Text('Mulai Proses'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.info,
                  minimumSize: const Size(0, 40),
                ),
              ),
            )
          else if (resep.status == StatusResep.diproses)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => onUpdateStatus(StatusResep.siap),
                icon: const Icon(Icons.check_rounded, size: 18),
                label: const Text('Tandai Siap Diambil'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.sukses,
                  minimumSize: const Size(0, 40),
                ),
              ),
            )
          else if (resep.status == StatusResep.siap)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => onUpdateStatus(StatusResep.selesai),
                icon: const Icon(Icons.done_all_rounded, size: 18),
                label: const Text('Konfirmasi Pengambilan'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.sukses,
                  minimumSize: const Size(0, 40),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
