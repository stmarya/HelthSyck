import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/providers/auth_provider.dart';

// ─── Models ──────────────────────────────────────────────────────────────────

class Hospital {
  final String id;
  final String name;
  final String type;
  final String city;
  final String province;
  final String? address;
  final String? phone;
  final bool isBPJSProvider;
  final int? totalBeds;
  final double? distanceKm;

  const Hospital({
    required this.id,
    required this.name,
    required this.type,
    required this.city,
    required this.province,
    this.address,
    this.phone,
    required this.isBPJSProvider,
    this.totalBeds,
    this.distanceKm,
  });

  factory Hospital.fromJson(Map<String, dynamic> json) => Hospital(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        type: json['type'] as String? ?? '',
        city: json['city'] as String? ?? '',
        province: json['province'] as String? ?? '',
        address: json['address'] as String?,
        phone: json['phone'] as String?,
        isBPJSProvider: json['isBPJSProvider'] as bool? ?? false,
        totalBeds: (json['totalBeds'] as num?)?.toInt(),
        distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

class HospitalSearchScreen extends ConsumerStatefulWidget {
  const HospitalSearchScreen({super.key});

  @override
  ConsumerState<HospitalSearchScreen> createState() =>
      _HospitalSearchScreenState();
}

class _HospitalSearchScreenState
    extends ConsumerState<HospitalSearchScreen> {
  final _searchCtrl = TextEditingController();
  List<Hospital> _hospitals = [];
  bool _loading = false;
  String? _error;
  bool _bpjsOnly = false;

  @override
  void initState() {
    super.initState();
    _search();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final token = ref.read(authProvider).accessToken;
      final client = ApiClient();
      final params = <String, String>{
        'limit': '30',
        if (_searchCtrl.text.isNotEmpty) 'q': _searchCtrl.text.trim(),
        if (_bpjsOnly) 'bpjs': 'true',
      };
      final query = params.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
      final res = await client.get(
        '/v1/hospitals?$query',
        port: 3007,
        token: token,
      );
      final data = (res['data'] as List<dynamic>? ?? [])
          .map((e) => Hospital.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() => _hospitals = data);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  String _hospitalIcon(String type) {
    switch (type.toUpperCase()) {
      case 'RUMAH_SAKIT_UMUM':
        return '🏥';
      case 'RUMAH_SAKIT_KHUSUS':
        return '🏨';
      case 'KLINIK':
        return '🏪';
      case 'PUSKESMAS':
        return '🏠';
      default:
        return '🏥';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Find Hospitals'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          // ── Search bar ──────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            color: const Color(0xFF1976D2).withOpacity(0.05),
            child: Column(
              children: [
                TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'Search by name or city...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchCtrl.clear();
                              _search();
                            },
                          )
                        : null,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                    filled: true,
                    fillColor: Colors.white,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                  ),
                  onSubmitted: (_) => _search(),
                  textInputAction: TextInputAction.search,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Checkbox(
                      value: _bpjsOnly,
                      onChanged: (v) {
                        setState(() => _bpjsOnly = v ?? false);
                        _search();
                      },
                    ),
                    const Text('BPJS Providers only'),
                    const Spacer(),
                    TextButton.icon(
                      onPressed: _search,
                      icon: const Icon(Icons.search, size: 16),
                      label: const Text('Search'),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // ── Results ────────────────────────────────────────────────────
          Expanded(
            child: _loading
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
                                onPressed: _search,
                                child: const Text('Retry')),
                          ],
                        ),
                      )
                    : _hospitals.isEmpty
                        ? const Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.local_hospital_outlined,
                                    size: 64, color: Colors.grey),
                                SizedBox(height: 12),
                                Text('No hospitals found',
                                    style: TextStyle(
                                        color: Colors.grey, fontSize: 16)),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _search,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _hospitals.length,
                              itemBuilder: (ctx, i) {
                                final h = _hospitals[i];
                                return Card(
                                  margin:
                                      const EdgeInsets.only(bottom: 12),
                                  child: ListTile(
                                    leading: CircleAvatar(
                                      backgroundColor: const Color(0xFF1976D2)
                                          .withOpacity(0.1),
                                      child: Text(_hospitalIcon(h.type),
                                          style: const TextStyle(fontSize: 20)),
                                    ),
                                    title: Text(h.name,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w600)),
                                    subtitle: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                            '${h.city}, ${h.province}',
                                            style: const TextStyle(
                                                fontSize: 12)),
                                        Row(
                                          children: [
                                            if (h.isBPJSProvider)
                                              Container(
                                                margin: const EdgeInsets.only(
                                                    right: 6, top: 4),
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 6,
                                                        vertical: 2),
                                                decoration: BoxDecoration(
                                                  color: Colors.green
                                                      .withOpacity(0.1),
                                                  borderRadius:
                                                      BorderRadius.circular(8),
                                                ),
                                                child: const Text('BPJS',
                                                    style: TextStyle(
                                                        fontSize: 10,
                                                        color: Colors.green,
                                                        fontWeight:
                                                            FontWeight.bold)),
                                              ),
                                            if (h.totalBeds != null)
                                              Text(
                                                  '${h.totalBeds} beds',
                                                  style: const TextStyle(
                                                      fontSize: 11,
                                                      color: Colors.grey)),
                                            if (h.distanceKm != null)
                                              Text(
                                                  ' • ${h.distanceKm!.toStringAsFixed(1)} km',
                                                  style: const TextStyle(
                                                      fontSize: 11,
                                                      color: Colors.grey)),
                                          ],
                                        ),
                                      ],
                                    ),
                                    trailing: h.phone != null
                                        ? const Icon(Icons.phone_outlined,
                                            color: Color(0xFF1976D2))
                                        : null,
                                    isThreeLine: true,
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
