import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers/auth_provider.dart';
import 'core/app_theme.dart';
import 'router.dart';

// ─────────────────────────────────────────────
// Entry point aplikasi
// ─────────────────────────────────────────────

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const ProviderScope(
      child: HealthSyncApp(),
    ),
  );
}

class HealthSyncApp extends ConsumerWidget {
  const HealthSyncApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final role = authState.user?.role ?? '';
    final router = buildMultiRoleRouter(authState);

    // Pilih tema berdasarkan role pengguna
    final theme = _themeForRole(role);

    return MaterialApp.router(
      title: 'HealthSync Indonesia',
      debugShowCheckedModeBanner: false,
      theme: theme,
      routerConfig: router,
    );
  }

  ThemeData _themeForRole(String role) {
    // Role dari database: PATIENT, DOCTOR, PHARMACIST, AMBULANCE_DRIVER, ADMIN, COMMAND_CENTER
    switch (role.toUpperCase()) {
      case 'PHARMACIST':
        return AppTheme.apotekTheme();
      case 'DOCTOR':
        return AppTheme.dokterTheme();
      case 'AMBULANCE_DRIVER':
        return AppTheme.driverTheme();
      default:
        // PATIENT, DOCTOR, ADMIN, COMMAND_CENTER → tema biru pasien
        return AppTheme.pasienTheme();
    }
  }
}
