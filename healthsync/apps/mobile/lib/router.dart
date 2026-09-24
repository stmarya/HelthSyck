import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/providers/auth_provider.dart';

// Screens pasien
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/vitals_screen.dart';
import 'screens/consultation_list_screen.dart';
import 'screens/consultation_room_screen.dart';
import 'screens/book_consultation_screen.dart';
import 'screens/prescriptions_screen.dart';
import 'screens/hospital_search_screen.dart';
import 'screens/ambulance_screen.dart';
import 'screens/profile_screen.dart';

// Screens apotek
import 'features/apotek/screens/dashboard_apotek_screen.dart';
import 'features/apotek/screens/resep_masuk_screen.dart';
import 'features/apotek/screens/kelola_obat_screen.dart';
import 'features/apotek/screens/history_apotek_screen.dart';

// Screens driver
import 'features/driver/screens/dashboard_driver_screen.dart';
import 'features/driver/screens/order_aktif_screen.dart';
import 'features/driver/screens/navigasi_screen.dart';
import 'features/driver/screens/riwayat_antar_screen.dart';

// Screens ambulans
import 'features/ambulans/screens/dashboard_ambulans_screen.dart';
import 'features/ambulans/screens/panggilan_darurat_screen.dart';
import 'features/ambulans/screens/navigasi_darurat_screen.dart';
import 'features/ambulans/screens/riwayat_tugas_screen.dart';
import 'features/dokter/screens/dashboard_dokter_screen.dart';
import 'features/dokter/screens/consultation_detail_dokter_screen.dart';
import 'features/dokter/screens/patient_clinical_screen.dart';
import 'features/dokter/screens/prescription_create_screen.dart';
import 'features/dokter/screens/prescription_detail_dokter_screen.dart';
import 'features/dokter/screens/rujukan_dokter_screen.dart';
import 'features/dokter/screens/riwayat_dokter_screen.dart';

// ─────────────────────────────────────────────
// Konstanta role — sesuai nilai dari database
// ─────────────────────────────────────────────

class AppRole {
  static const String pasien    = 'PATIENT';
  static const String dokter    = 'DOCTOR';
  static const String apotek    = 'PHARMACIST';         // DB: PHARMACIST
  static const String driver    = 'AMBULANCE_DRIVER';   // DB: AMBULANCE_DRIVER
  static const String ambulans  = 'AMBULANCE_DRIVER';   // sama dengan driver (unit)
  static const String admin     = 'ADMIN';
  static const String cc        = 'COMMAND_CENTER';
}

// ─────────────────────────────────────────────
// Router multi-role
// ─────────────────────────────────────────────

GoRouter buildMultiRoleRouter(AuthState authState) {
  return GoRouter(
    initialLocation: '/',
    redirect: (BuildContext context, GoRouterState state) {
      final isAuth    = authState.status == AuthStatus.authenticated;
      final isUnknown = authState.status == AuthStatus.unknown;
      final isLogin   = state.fullPath == '/login';

      if (isUnknown) return null;
      if (!isAuth && !isLogin) return '/login';
      if (isAuth && isLogin) {
        // Arahkan ke dashboard sesuai role
        return _dashboardForRole(authState.user?.role ?? '');
      }
      return null;
    },
    routes: [
      // ── Root & Auth ────────────────────────────────
      GoRoute(
        path: '/',
        builder: (_, __) => const HomeScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (_, __) => const LoginScreen(),
      ),

      // ── Pasien ─────────────────────────────────────
      GoRoute(path: '/dashboard',     builder: (_, __) => const DashboardScreen()),
      GoRoute(path: '/vitals',        builder: (_, __) => const VitalsScreen()),
      GoRoute(path: '/consultations', builder: (_, __) => const ConsultationListScreen()),
      GoRoute(
        path: '/consultations/book',
        builder: (_, __) => const BookConsultationScreen(),
      ),
      GoRoute(
        path: '/consultations/:id',
        builder: (_, s) => ConsultationRoomScreen(
          consultationId: s.pathParameters['id']!,
        ),
      ),
      GoRoute(path: '/prescriptions', builder: (_, __) => const PrescriptionsScreen()),
      GoRoute(path: '/hospitals',     builder: (_, __) => const HospitalSearchScreen()),
      GoRoute(path: '/ambulance',     builder: (_, __) => const AmbulanceScreen()),
      GoRoute(path: '/profile',       builder: (_, __) => const ProfileScreen()),

      // ── Dokter ─────────────────────────────────────
      GoRoute(path: '/doctor', builder: (_, __) => const DashboardDokterScreen()),
      GoRoute(
        path: '/doctor/consultations/:id',
        builder: (_, s) => ConsultationDetailDokterScreen(
          consultationId: s.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/doctor/patients/:patientId',
        builder: (_, s) => PatientClinicalScreen(
          patientId: s.pathParameters['patientId']!,
        ),
      ),
      GoRoute(
        path: '/doctor/prescriptions/new/:consultationId/:patientId',
        builder: (_, s) => PrescriptionCreateScreen(
          consultationId: s.pathParameters['consultationId']!,
          patientId: s.pathParameters['patientId']!,
        ),
      ),
      GoRoute(
        path: '/doctor/prescriptions/:prescriptionId',
        builder: (_, s) => PrescriptionDetailDokterScreen(
          prescriptionId: s.pathParameters['prescriptionId']!,
        ),
      ),
      GoRoute(
        path: '/doctor/referrals',
        builder: (_, __) => const RujukanDokterScreen(),
      ),
      GoRoute(
        path: '/doctor/referrals/new/:patientId',
        builder: (_, s) => RujukanDokterScreen(
          patientId: s.pathParameters['patientId']!,
        ),
      ),
      GoRoute(
        path: '/doctor/history',
        builder: (_, __) => const RiwayatDokterScreen(),
      ),

      // ── Apotek ─────────────────────────────────────
      GoRoute(path: '/apotek',            builder: (_, __) => const DashboardApotekScreen()),
      GoRoute(path: '/apotek/resep',      builder: (_, __) => const ResepMasukScreen()),
      GoRoute(path: '/apotek/obat',       builder: (_, __) => const KelolaObatScreen()),
      GoRoute(path: '/apotek/history',    builder: (_, __) => const HistoryApotekScreen()),

      // ── Driver ─────────────────────────────────────
      GoRoute(path: '/driver',            builder: (_, __) => const DashboardDriverScreen()),
      GoRoute(path: '/driver/order',      builder: (_, __) => const OrderAktifScreen()),
      GoRoute(
        path: '/driver/navigasi/:orderId',
        builder: (_, s) => NavigasiScreen(orderId: s.pathParameters['orderId']!),
      ),
      GoRoute(path: '/driver/riwayat',    builder: (_, __) => const RiwayatAntarScreen()),

      // ── Ambulans ───────────────────────────────────
      GoRoute(path: '/ambulans',              builder: (_, __) => const DashboardAmbulansScreen()),
      GoRoute(path: '/ambulans/panggilan',    builder: (_, __) => const PanggilanDaruratScreen()),
      GoRoute(
        path: '/ambulans/navigasi/:taskId',
        builder: (_, s) => NavigasiDaruratScreen(taskId: s.pathParameters['taskId']!),
      ),
      GoRoute(path: '/ambulans/riwayat',      builder: (_, __) => const RiwayatTugasScreen()),
    ],
  );
}

String _dashboardForRole(String role) {
  switch (role.toUpperCase()) {
    case AppRole.dokter:   return '/doctor';
    case AppRole.apotek:   return '/apotek';
    case AppRole.driver:   return '/driver';
    case AppRole.ambulans: return '/ambulans';
    default:               return '/dashboard';
  }
}
