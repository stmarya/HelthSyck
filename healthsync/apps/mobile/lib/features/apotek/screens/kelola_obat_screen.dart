import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_theme.dart';
import '../../../core/models/pharmacy.dart';
import '../../../core/providers/pharmacy_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/section_header.dart';

/// Halaman kelola inventori obat untuk Apotek
class KelolaObatScreen extends ConsumerStatefulWidget {
  const KelolaObatScreen({super.key});

  @override
  ConsumerState<KelolaObatScreen> createState() => _KelolaObatScreenState();
}

class _KelolaObatScreenState extends ConsumerState<KelolaObatScreen> {
  String _query = '';
  String _filterKategori = 'Semua';

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(obatProvider.notifier).fetchObat());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(obatProvider);
    final kategoris = ['Semua', ...{...state.items.map((o) => o.kategori)}];
    final filtered = state.items.where((o) {
      final matchQuery = _query.isEmpty ||
          o.nama.toLowerCase().contains(_query.toLowerCase());
      final matchKategori =
          _filterKategori == 'Semua' || o.kategori == _filterKategori;
      return matchQuery && matchKategori;
    }).toList();

    final kritis = filtered.where(
        (o) => o.stokMinimum != null && o.stok < (o.stokMinimum ?? 0));

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      appBar: AppBar(
        title: const Text('Kelola Obat'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.read(obatProvider.notifier).fetchObat(),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Search & Filter ──────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(AppTheme.sM),
            child: Column(
              children: [
                // Search bar
                TextField(
                  onChanged: (v) => setState(() => _query = v),
                  decoration: const InputDecoration(
                    hintText: 'Cari nama obat...',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: AppTheme.sS),
                // Kategori chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: kategoris.map((k) {
                      final active = _filterKategori == k;
                      return Padding(
                        padding: const EdgeInsets.only(right: AppTheme.sS),
                        child: FilterChip(
                          label: Text(k),
                          selected: active,
                          onSelected: (_) =>
                              setState(() => _filterKategori = k),
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
                            fontSize: 12,
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
              ],
            ),
          ),
          const Divider(height: 1),

          // ── Stok Kritis Banner ───────────────────────────
          if (kritis.isNotEmpty)
            Container(
              margin: const EdgeInsets.all(AppTheme.sM),
              padding: const EdgeInsets.all(AppTheme.sM),
              decoration: BoxDecoration(
                color: AppTheme.bahaya.withOpacity(0.08),
                borderRadius: BorderRadius.circular(AppTheme.rS),
                border: Border.all(
                    color: AppTheme.bahaya.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: AppTheme.bahaya, size: 20),
                  const SizedBox(width: AppTheme.sS),
                  Expanded(
                    child: Text(
                      '${kritis.length} obat stok kritis — segera restock!',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.bahaya,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // ── Daftar Obat ──────────────────────────────────
          Expanded(
            child: state.isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? const EmptyState(
                        icon: Icons.medication_rounded,
                        title: 'Tidak ada obat',
                        subtitle: 'Tidak ada obat yang sesuai pencarian',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppTheme.sM),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppTheme.sS),
                        itemBuilder: (_, i) => _ObatTile(obat: filtered[i]),
                      ),
          ),
        ],
      ),
    );
  }
}

class _ObatTile extends StatelessWidget {
  final Obat obat;
  const _ObatTile({required this.obat});

  @override
  Widget build(BuildContext context) {
    final kritis =
        obat.stokMinimum != null && obat.stok < (obat.stokMinimum ?? 0);

    return HealthCard(
      borderColor: kritis ? AppTheme.bahaya.withOpacity(0.4) : null,
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: (kritis ? AppTheme.bahaya : AppTheme.info)
                  .withOpacity(0.10),
              borderRadius: BorderRadius.circular(AppTheme.rS),
            ),
            child: Icon(
              Icons.medication_liquid_rounded,
              color: kritis ? AppTheme.bahaya : AppTheme.info,
              size: 22,
            ),
          ),
          const SizedBox(width: AppTheme.sM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(obat.nama,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 14)),
                Text(obat.kategori,
                    style: const TextStyle(
                        fontSize: 12, color: AppTheme.abu500)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${obat.stok} ${obat.satuan}',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: kritis ? AppTheme.bahaya : AppTheme.abu900,
                ),
              ),
              if (kritis)
                const Text(
                  'KRITIS',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.bahaya,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
