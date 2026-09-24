import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_theme.dart';
import '../../../core/models/ambulance_task.dart';
import '../../../core/providers/ambulance_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/section_header.dart';

/// Halaman daftar panggilan darurat masuk untuk Ambulans
class PanggilanDaruratScreen extends ConsumerStatefulWidget {
  const PanggilanDaruratScreen({super.key});

  @override
  ConsumerState<PanggilanDaruratScreen> createState() =>
      _PanggilanDaruratScreenState();
}

class _PanggilanDaruratScreenState
    extends ConsumerState<PanggilanDaruratScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() =>
        ref.read(ambulansProvider.notifier).fetchTugas());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(ambulansProvider);
    // Tampilkan semua tugas yang belum selesai
    final aktif = state.tugasHistory
        .where((t) => t.status != StatusAmbulans.selesai)
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      appBar: AppBar(
        title: const Text('Panggilan Darurat'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () =>
                ref.read(ambulansProvider.notifier).fetchTugas(),
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : aktif.isEmpty
              ? EmptyState(
                  icon: Icons.emergency_rounded,
                  title: 'Tidak ada panggilan aktif',
                  subtitle: 'Unit siaga — menunggu panggilan darurat masuk',
                  actionLabel: 'Muat Ulang',
                  onAction: () =>
                      ref.read(ambulansProvider.notifier).fetchTugas(),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(AppTheme.sM),
                  itemCount: aktif.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(height: AppTheme.sS),
                  itemBuilder: (_, i) => _PanggilanCard(
                    task: aktif[i],
                    onTerima: () {
                      ref
                          .read(ambulansProvider.notifier)
                          .updateStatusTugas(
                              aktif[i].id,
                              StatusAmbulans.menuju);
                      context.push(
                          '/ambulans/navigasi/${aktif[i].id}');
                    },
                    onUpdateStatus: (status) => ref
                        .read(ambulansProvider.notifier)
                        .updateStatusTugas(aktif[i].id, status),
                  ),
                ),
    );
  }
}

class _PanggilanCard extends StatelessWidget {
  final AmbulanceTask task;
  final VoidCallback onTerima;
  final void Function(String) onUpdateStatus;

  const _PanggilanCard({
    required this.task,
    required this.onTerima,
    required this.onUpdateStatus,
  });

  @override
  Widget build(BuildContext context) {
    final isDarurat = task.prioritas == PrioritasAmbulans.darurat ||
        task.prioritas == PrioritasAmbulans.kritis;

    return HealthCard(
      borderColor: isDarurat ? AppTheme.bahaya.withOpacity(0.5) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: (isDarurat ? AppTheme.bahaya : AppTheme.info)
                      .withOpacity(0.10),
                  borderRadius: BorderRadius.circular(AppTheme.rS),
                ),
                child: Icon(
                  isDarurat
                      ? Icons.emergency_rounded
                      : Icons.local_hospital_rounded,
                  color: isDarurat ? AppTheme.bahaya : AppTheme.info,
                  size: 20,
                ),
              ),
              const SizedBox(width: AppTheme.sM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(task.pasienNama,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15)),
                    Text(
                      _labelPrioritas(task.prioritas),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isDarurat
                            ? AppTheme.bahaya
                            : AppTheme.info,
                      ),
                    ),
                  ],
                ),
              ),
              StatusBadge.auto(task.status),
            ],
          ),

          const Divider(height: AppTheme.sM + AppTheme.sS),

          // Lokasi
          _LokasiRow(
              icon: Icons.person_pin_circle_rounded,
              label: 'Lokasi Pasien',
              value: task.alamatPasien,
              color: AppTheme.bahaya),
          const SizedBox(height: AppTheme.sS),
          _LokasiRow(
              icon: Icons.local_hospital_rounded,
              label: 'Tujuan RS',
              value: task.tujuanRS,
              color: AppTheme.info),

          if (task.kondisiPasien != null) ...[
            const SizedBox(height: AppTheme.sS),
            Container(
              padding: const EdgeInsets.all(AppTheme.sS),
              decoration: BoxDecoration(
                color: AppTheme.abu100,
                borderRadius: BorderRadius.circular(AppTheme.rS),
              ),
              child: Row(
                children: [
                  const Icon(Icons.medical_information_rounded,
                      size: 14, color: AppTheme.abu500),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      task.kondisiPasien!,
                      style: const TextStyle(
                          fontSize: 12, color: AppTheme.abu700),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: AppTheme.sM),

          // Aksi
          if (task.status == StatusAmbulans.standby ||
              task.status == StatusAmbulans.menuju)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onTerima,
                icon: const Icon(Icons.navigation_rounded, size: 18),
                label: const Text('Terima & Navigasi'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.bahaya,
                  minimumSize: const Size(0, 44),
                ),
              ),
            )
          else if (task.status == StatusAmbulans.tiba)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () =>
                    onUpdateStatus(StatusAmbulans.membawa),
                icon: const Icon(Icons.airline_seat_flat_rounded,
                    size: 18),
                label: const Text('Pasien Naik — Mulai Transfer'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.peringatan,
                  minimumSize: const Size(0, 44),
                ),
              ),
            )
          else if (task.status == StatusAmbulans.membawa)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () =>
                    onUpdateStatus(StatusAmbulans.selesai),
                icon: const Icon(Icons.check_rounded, size: 18),
                label: const Text('Pasien Tiba di RS — Selesai'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.sukses,
                  minimumSize: const Size(0, 44),
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _labelPrioritas(String p) {
    switch (p) {
      case PrioritasAmbulans.kritis:  return '🔴 Prioritas Kritis';
      case PrioritasAmbulans.darurat: return '🟠 Darurat';
      default:                        return '🟢 Normal';
    }
  }
}

class _LokasiRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _LokasiRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 6),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(
                      fontSize: 10, color: AppTheme.abu500)),
              Text(value,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ],
    );
  }
}
