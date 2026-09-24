import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';

class PrescriptionCreateScreen extends ConsumerStatefulWidget {
  final String consultationId;
  final String patientId;

  const PrescriptionCreateScreen({
    super.key,
    required this.consultationId,
    required this.patientId,
  });

  @override
  ConsumerState<PrescriptionCreateScreen> createState() => _PrescriptionCreateScreenState();
}

class _PrescriptionCreateScreenState extends ConsumerState<PrescriptionCreateScreen> {
  final _searchController = TextEditingController();
  final _dosageController = TextEditingController();
  final _quantityController = TextEditingController(text: '1');
  final _instructionsController = TextEditingController();
  final List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _drugs = const [];
  bool _searching = false;
  bool _submitting = false;
  String? _error;

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void dispose() {
    _searchController.dispose();
    _dosageController.dispose();
    _quantityController.dispose();
    _instructionsController.dispose();
    super.dispose();
  }

  Future<void> _searchDrugs() async {
    final query = _searchController.text.trim();
    if (query.length < 2) {
      setState(() => _error = 'Masukkan minimal 2 karakter untuk mencari obat.');
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final response = await _api.get(
        '/v1/drugs/search?q=${Uri.encodeQueryComponent(query)}',
        port: 3008,
      );
      final raw = response['data'];
      if (!mounted) return;
      setState(() {
        _drugs = raw is List
            ? raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
            : const [];
        _searching = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _error = error.detail;
      });
    }
  }

  Future<void> _addDrug(Map<String, dynamic> drug) async {
    final quantity = int.tryParse(_quantityController.text.trim());
    if (quantity == null || quantity < 1) {
      setState(() => _error = 'Jumlah obat harus berupa angka minimal 1.');
      return;
    }
    if (_dosageController.text.trim().isEmpty) {
      setState(() => _error = 'Aturan dosis wajib diisi.');
      return;
    }
    setState(() {
      _items.add({
        'drugId': drug['id']?.toString() ?? '',
        'drugName': drug['generic_name']?.toString() ?? drug['brand_name']?.toString() ?? 'Obat',
        'brandName': drug['brand_name']?.toString(),
        'dosageForm': drug['dosage_form']?.toString(),
        'strength': drug['strength']?.toString(),
        'unit': drug['unit']?.toString(),
        'drugClass': drug['drug_class']?.toString(),
        'dosage': _dosageController.text.trim(),
        'quantity': quantity,
        'instructions': _instructionsController.text.trim(),
        'substitutionAllowed': false,
      });
      _dosageController.clear();
      _quantityController.text = '1';
      _instructionsController.clear();
      _error = null;
    });
  }

  Future<void> _submit() async {
    if (_items.isEmpty) {
      setState(() => _error = 'Tambahkan minimal satu obat.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await _api.post(
        '/v1/prescriptions',
        port: 3004,
        body: {
          'consultationId': widget.consultationId,
          'patientId': widget.patientId,
          'items': _items,
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Resep berhasil dibuat.')),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = error.detail;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Buat resep')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Pasien ${widget.patientId.substring(
              0,
              widget.patientId.length < 8 ? widget.patientId.length : 8,
            )}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _searchController,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _searchDrugs(),
            decoration: InputDecoration(
              labelText: 'Cari obat',
              hintText: 'Nama generik atau brand',
              suffixIcon: IconButton(
                onPressed: _searching ? null : _searchDrugs,
                icon: _searching
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.search),
              ),
            ),
          ),
          const SizedBox(height: 8),
          if (_drugs.isNotEmpty)
            Card(
              child: Column(
                children: _drugs.map((drug) {
                  final name = drug['generic_name']?.toString()
                      ?? drug['brand_name']?.toString()
                      ?? 'Obat';
                  return ListTile(
                    title: Text(name),
                    subtitle: Text(
                      '${drug['brand_name'] ?? '-'} • '
                      '${drug['dosage_form'] ?? '-'} ${drug['strength'] ?? ''}\n'
                      'Kelas: ${drug['drug_class'] ?? '-'} • '
                      'Resep wajib: ${drug['requires_prescription'] == true ? 'Ya' : 'Tidak'}',
                    ),
                    isThreeLine: true,
                    trailing: const Icon(Icons.add_circle_outline),
                    onTap: () => _showDrugForm(drug),
                  );
                }).toList(),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(_error!, style: TextStyle(color: Colors.red.shade700)),
            ),
          const SizedBox(height: 12),
          Text('Obat yang diresepkan', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (_items.isEmpty)
            const Card(child: ListTile(title: Text('Belum ada obat ditambahkan.')))
          else
            ..._items.asMap().entries.map(
                  (entry) => Card(
                    child: ListTile(
                      title: Text(entry.value['drugName']?.toString() ?? 'Obat'),
                      subtitle: Text(
                        '${entry.value['brandName'] ?? '-'} • '
                        '${entry.value['dosageForm'] ?? '-'} ${entry.value['strength'] ?? ''}\n'
                        'Dosis: ${entry.value['dosage']} • Jumlah: ${entry.value['quantity']} ${entry.value['unit'] ?? 'item'}'
                        '${(entry.value['instructions'] as String).isEmpty ? '' : ' • ${entry.value['instructions']}'}',
                      ),
                      isThreeLine: true,
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => setState(() => _items.removeAt(entry.key)),
                      ),
                    ),
                  ),
                ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.receipt_long),
            label: const Text('Terbitkan resep'),
          ),
        ],
      ),
    );
  }

  Future<void> _showDrugForm(Map<String, dynamic> drug) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              drug['generic_name']?.toString() ?? drug['brand_name']?.toString() ?? 'Obat',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _dosageController,
              decoration: const InputDecoration(labelText: 'Dosis dan frekuensi'),
            ),
            TextField(
              controller: _quantityController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Jumlah'),
            ),
            TextField(
              controller: _instructionsController,
              decoration: const InputDecoration(labelText: 'Instruksi penggunaan'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () {
                Navigator.pop(context);
                _addDrug(drug);
              },
              child: const Text('Tambahkan'),
            ),
          ],
        ),
      ),
    );
  }
}