import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getActiveServerHttpUrl } from '../services/syncService';
import { printKdsTestSlip, KdsStation } from '../utils/kdsAutoPrint';
import { useSettingsStore } from '../store/settingsStore';

type PrinterMode = 'agent' | 'windows' | 'network' | 'disabled';

interface StationPrinterStatusResponse {
  serverUrl: string;
  serverWindowsPrinters: string[];
  kitchen: {
    config: { station: 'main'; mode: PrinterMode; printerName: string; host: string; port: number };
    agent: { online: boolean; pcName?: string | null; activePrinter?: string | null; availablePrinters?: string[]; ip?: string };
    pendingJobs: number;
  };
  juice: {
    config: { station: 'juice'; mode: PrinterMode; printerName: string; host: string; port: number };
    agent: { online: boolean; pcName?: string | null; activePrinter?: string | null; availablePrinters?: string[]; ip?: string };
    pendingJobs: number;
  };
}

interface StationPrinterModalProps {
  visible: boolean;
  station: KdsStation;
  onClose: () => void;
  onStatusUpdated?: (status: { online: boolean; label: string; mode: PrinterMode }) => void;
}

function getApiBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return getActiveServerHttpUrl();
}

export default function StationPrinterModal({
  visible,
  station,
  onClose,
  onStatusUpdated,
}: StationPrinterModalProps) {
  const isJuice = station === 'juice';
  const accent = isJuice ? '#FF9500' : '#D5A943';
  const title = isJuice ? 'Juice Bar Dedicated Printer Setup' : 'Main Kitchen Printer Setup';

  const onStatusUpdatedRef = useRef(onStatusUpdated);
  useEffect(() => {
    onStatusUpdatedRef.current = onStatusUpdated;
  }, [onStatusUpdated]);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusData, setStatusData] = useState<StationPrinterStatusResponse | null>(null);

  const [mode, setMode] = useState<PrinterMode>(isJuice ? 'agent' : 'windows');
  const [printerName, setPrinterName] = useState<string>(isJuice ? 'AUTO' : 'POS-80');
  const [host, setHost] = useState<string>('');
  const [port, setPort] = useState<string>('9100');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const fetchStatus = useCallback(async (syncForm = false) => {
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/print/status`, { cache: 'no-store' });
      if (!res.ok) return;
      const data: StationPrinterStatusResponse = await res.json();
      setStatusData(data);

      const stationInfo = isJuice ? data.juice : data.kitchen;
      if (syncForm && stationInfo?.config) {
        setMode(stationInfo.config.mode || (isJuice ? 'agent' : 'windows'));
        setPrinterName(stationInfo.config.printerName || (isJuice ? 'AUTO' : 'POS-80'));
        setHost(stationInfo.config.host || '');
        setPort(String(stationInfo.config.port || 9100));
      }

      const cb = onStatusUpdatedRef.current;
      if (cb && stationInfo) {
        const cfg = stationInfo.config;
        if (cfg.mode === 'agent') {
          const online = !!stationInfo.agent?.online;
          cb({
            online,
            mode: 'agent',
            label: online
              ? `${stationInfo.agent?.activePrinter || 'USB Printer'}`
              : 'Connect Juice Printer',
          });
        } else if (cfg.mode === 'network') {
          cb({
            online: !!cfg.host,
            mode: 'network',
            label: cfg.host ? `LAN ${cfg.host}` : 'Set IP',
          });
        } else if (cfg.mode === 'windows') {
          cb({
            online: true,
            mode: 'windows',
            label: cfg.printerName || 'POS-80',
          });
        } else {
          cb({ online: false, mode: 'disabled', label: 'Disabled' });
        }
      }
    } catch {
      // Ignore transient network errors
    }
  }, [isJuice]);

  // Only initialize when modal opens — NEVER re-run on parent 1-second clock ticks!
  useEffect(() => {
    if (!visible) return;
    let active = true;
    const initTimer = setTimeout(() => {
      if (active) {
        void fetchStatus(true);
      }
    }, 0);
    const pollTimer = setInterval(() => {
      if (active) {
        void fetchStatus(false);
      }
    }, 5000);
    return () => {
      active = false;
      clearTimeout(initTimer);
      clearInterval(pollTimer);
    };
  }, [visible, fetchStatus]);

  const stationInfo = statusData ? (isJuice ? statusData.juice : statusData.kitchen) : null;
  const agent = stationInfo?.agent;
  const agentOnline = !!agent?.online;
  const agentPrinters = Array.isArray(agent?.availablePrinters) ? agent.availablePrinters : [];
  const serverWindowsPrinters = Array.isArray(statusData?.serverWindowsPrinters)
    ? statusData.serverWindowsPrinters
    : ['POS-80'];

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const base = getApiBaseUrl();
      const payload = isJuice
        ? {
            juicePrinterMode: mode,
            juicePrinterName: printerName.trim() || 'AUTO',
            juicePrinterHost: host.trim(),
            juicePrinterPort: Number(port) || 9100,
          }
        : {
            kitchenPrinterMode: mode,
            kitchenPrinterName: printerName.trim() || 'POS-80',
            kitchenPrinterHost: host.trim(),
            kitchenPrinterPort: Number(port) || 9100,
          };

      const res = await fetch(`${base}/api/print/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        try {
          useSettingsStore.getState().updateSettings(payload as any);
        } catch {}
        setFeedback({ type: 'ok', text: 'Printer routing saved & synced across all terminals!' });
        await fetchStatus(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ type: 'err', text: errData.error || 'Failed to save printer configuration.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'err', text: e?.message || 'Unable to reach Central Hub.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadAgent = async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    setDownloading(true);
    setFeedback(null);
    const filename = `Sultan-${isJuice ? 'JuiceBar' : 'Kitchen'}-Printer-Setup.zip`;
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/print-agent/download?station=${station}`);
      if (!res.ok) throw new Error('Server returned HTTP ' + res.status);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 2000);
      setFeedback({
        type: 'ok',
        text: `Downloaded ${filename}! Extract the ZIP on the ${isJuice ? 'Juice Bar' : 'Kitchen'} PC and double-click Start-${isJuice ? 'JuiceBar' : 'Kitchen'}-Printer.bat.`,
      });
    } catch (e: any) {
      setFeedback({
        type: 'err',
        text: e?.message || 'Download failed — please check connection to server.',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const result = await printKdsTestSlip(station);
      if (result.success) {
        setFeedback({
          type: 'ok',
          text: `Test KOT slip printed cleanly on ${result.printer || (isJuice ? 'Juice Bar Printer' : 'Kitchen Printer')}!`,
        });
      } else if (result.agentOffline) {
        setFeedback({
          type: 'warn',
          text: `${isJuice ? 'Juice Bar' : 'Kitchen'} Print Agent is offline. Download & run Start-${isJuice ? 'JuiceBar' : 'Kitchen'}-Printer.bat on the ${isJuice ? 'Juice Bar' : 'Kitchen'} PC.`,
        });
      } else {
        setFeedback({
          type: 'err',
          text: result.error || 'Test print failed. Check USB cable or printer configuration.',
        });
      }
    } finally {
      setTesting(false);
    }
  };

  const modeOptions: { id: PrinterMode; label: string; sub: string; icon: any }[] = [
    {
      id: 'agent',
      label: isJuice ? 'Juice Bar PC USB (Recommended)' : 'Remote PC USB Agent',
      sub: 'Zero-popup ESC/POS via USB printer plugged into this station PC',
      icon: 'desktop-outline',
    },
    {
      id: 'windows',
      label: 'Server PC Windows Printer',
      sub: 'USB or Shared Windows printer installed on Server PC (192.168.1.10)',
      icon: 'print-outline',
    },
    {
      id: 'network',
      label: 'LAN / Wi-Fi IP Printer (9100)',
      sub: 'Direct Ethernet / Wi-Fi thermal printer via static IP address',
      icon: 'wifi-outline',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={[styles.iconBadge, { borderColor: accent }]}>
                <Ionicons name="print" size={22} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>
                  {isJuice
                    ? 'Strictly isolated for Beverages, Coffee, Tea, Mocktails, Ice Cream & Cold Drinks'
                    : 'Strictly isolated for Main Kitchen food orders (never prints Juice Bar drinks)'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeIconBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#E5E7EB" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Isolation Guarantee Banner */}
            <View style={[styles.guaranteeBanner, { borderColor: isJuice ? 'rgba(255,149,0,0.35)' : 'rgba(16,185,129,0.35)' }]}>
              <Ionicons name="shield-checkmark" size={18} color={isJuice ? '#FF9500' : '#34D399'} />
              <Text style={styles.guaranteeText}>
                {isJuice
                  ? 'Conflict-Free Routing Active: Juice Bar slips NEVER print on the Kitchen printer (POS-80).'
                  : 'Conflict-Free Routing Active: Kitchen printer prints ONLY Main Kitchen food items — zero Juice Bar slips.'}
              </Text>
            </View>

            {!statusData ? (
              <View style={{ padding: 28, alignItems: 'center' }}>
                <ActivityIndicator color={accent} />
                <Text style={{ color: '#9CA3AF', marginTop: 10, fontSize: 13 }}>Checking printer status...</Text>
              </View>
            ) : (
              <>
                {/* Mode Selector */}
                <Text style={styles.sectionLabel}>CONNECTION MODE</Text>
                <View style={styles.modeGrid}>
                  {modeOptions.map((opt) => {
                    const active = mode === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.modeCard,
                          active && { borderColor: accent, backgroundColor: 'rgba(255,149,0,0.12)' },
                        ]}
                        onPress={() => setMode(opt.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name={opt.icon} size={18} color={active ? accent : '#9CA3AF'} />
                        <Text style={[styles.modeTitle, active && { color: '#FFFFFF' }]}>{opt.label}</Text>
                        <Text style={styles.modeSub}>{opt.sub}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* MODE 1: REMOTE STATION PC AGENT */}
                {mode === 'agent' && (
                  <View style={styles.panel}>
                    <View style={styles.agentStatusRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: agentOnline ? '#10B981' : '#F59E0B' },
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.agentStatusTitle}>
                          {agentOnline
                            ? `Connected: ${agent?.pcName || 'Juice Bar PC'} → ${agent?.activePrinter || 'Thermal Printer'}`
                            : `${isJuice ? 'Juice Bar' : 'Kitchen'} PC Print Agent Not Connected Yet`}
                        </Text>
                        <Text style={styles.agentStatusSub}>
                          {agentOnline
                            ? `Live zero-popup ESC/POS link active (${agent?.ip || 'LAN'}). Pending queue: ${stationInfo?.pendingJobs || 0}`
                            : `Run the dedicated Desktop Printer Agent on the ${isJuice ? 'Juice Bar' : 'Kitchen'} PC where the USB printer is plugged in.`}
                        </Text>
                      </View>
                    </View>

                    {/* Download Setup Pack Button */}
                    <TouchableOpacity
                      style={[styles.downloadBtn, { backgroundColor: accent, opacity: downloading ? 0.7 : 1 }]}
                      onPress={handleDownloadAgent}
                      disabled={downloading}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="cloud-download-outline" size={18} color="#111827" />
                      <Text style={styles.downloadBtnText}>
                        {downloading
                          ? 'Preparing Download...'
                          : `Download ${isJuice ? 'Juice Bar' : 'Kitchen'} Printer Agent (.zip)`}
                      </Text>
                    </TouchableOpacity>

                    {/* 2-Step Zero-Touch Quick Guide */}
                    <View style={styles.stepsBox}>
                      <Text style={styles.stepsHeading}>One-Time Setup (On {isJuice ? 'Juice Bar' : 'Kitchen'} PC):</Text>
                      <Text style={styles.stepLine}>1. Download the ZIP above on the {isJuice ? 'Juice Bar' : 'Kitchen'} PC, RIGHT-CLICK it and click <Text style={styles.codeInline}>Extract All...</Text>.</Text>
                      <Text style={styles.stepLine}>2. Double-click <Text style={styles.codeInline}>Start-{isJuice ? 'JuiceBar' : 'Kitchen'}-Printer.bat</Text> ONCE — it automatically picks up your USB printer AND enables Windows Boot Auto-Start in the background!</Text>
                      <Text style={styles.stepLine}>3. Click <Text style={styles.codeInline}>Print Test Slip</Text> to confirm. (Need driver diagnostics? Run <Text style={styles.codeInline}>Diagnose-{isJuice ? 'JuiceBar' : 'Kitchen'}-Printer.bat</Text>.)</Text>
                    </View>

                    {/* Printer Selection on Remote PC */}
                    <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
                      PRINTER ON {isJuice ? 'JUICE BAR' : 'STATION'} PC
                    </Text>
                    <View style={styles.chipWrap}>
                      {['AUTO', ...agentPrinters].map((pName) => {
                        const selected = printerName.toLowerCase() === pName.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={pName}
                            style={[
                              styles.printerChip,
                              selected && { borderColor: accent, backgroundColor: 'rgba(255,149,0,0.18)' },
                            ]}
                            onPress={() => setPrinterName(pName)}
                          >
                            <Ionicons
                              name={pName === 'AUTO' ? 'sparkles' : 'print-outline'}
                              size={13}
                              color={selected ? accent : '#9CA3AF'}
                            />
                            <Text style={[styles.printerChipText, selected && { color: '#FFF' }]}>
                              {pName === 'AUTO' ? 'AUTO (Detect Thermal Printer)' : pName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* MODE 2: SERVER WINDOWS PRINTER */}
                {mode === 'windows' && (
                  <View style={styles.panel}>
                    <Text style={styles.sectionLabel}>INSTALLED WINDOWS PRINTERS ON SERVER PC</Text>
                    <View style={styles.chipWrap}>
                      {serverWindowsPrinters.map((pName) => {
                        const selected = printerName.toLowerCase() === pName.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={pName}
                            style={[
                              styles.printerChip,
                              selected && { borderColor: accent, backgroundColor: 'rgba(213,169,67,0.18)' },
                            ]}
                            onPress={() => setPrinterName(pName)}
                          >
                            <Ionicons name="print-outline" size={13} color={selected ? accent : '#9CA3AF'} />
                            <Text style={[styles.printerChipText, selected && { color: '#FFF' }]}>{pName}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={[styles.inputLabel, { marginTop: 10 }]}>
                      Or enter exact Windows / Shared Printer Name (e.g. POS-80 or \\JUICE-PC\POS-80)
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={printerName}
                      onChangeText={setPrinterName}
                      placeholder="POS-80"
                      placeholderTextColor="#6B7280"
                    />
                  </View>
                )}

                {/* MODE 3: LAN NETWORK TCP 9100 */}
                {mode === 'network' && (
                  <View style={styles.panel}>
                    <Text style={styles.sectionLabel}>LAN / WI-FI THERMAL PRINTER (RAW TCP 9100)</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.inputLabel}>Printer Static IP Address</Text>
                        <TextInput
                          style={styles.input}
                          value={host}
                          onChangeText={setHost}
                          placeholder="192.168.1.200"
                          placeholderTextColor="#6B7280"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>TCP Port</Text>
                        <TextInput
                          style={styles.input}
                          value={port}
                          onChangeText={setPort}
                          placeholder="9100"
                          placeholderTextColor="#6B7280"
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  </View>
                )}

                {/* Feedback Banner */}
                {feedback && (
                  <View
                    style={[
                      styles.feedbackBox,
                      feedback.type === 'ok'
                        ? styles.feedbackOk
                        : feedback.type === 'warn'
                          ? styles.feedbackWarn
                          : styles.feedbackErr,
                    ]}
                  >
                    <Ionicons
                      name={
                        feedback.type === 'ok'
                          ? 'checkmark-circle'
                          : feedback.type === 'warn'
                            ? 'alert-circle'
                            : 'close-circle'
                      }
                      size={16}
                      color={
                        feedback.type === 'ok'
                          ? '#34D399'
                          : feedback.type === 'warn'
                            ? '#FBBF24'
                            : '#F87171'
                      }
                    />
                    <Text style={styles.feedbackText}>{feedback.text}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTestPrint}
              disabled={testing}
              activeOpacity={0.8}
            >
              <Ionicons name="receipt-outline" size={16} color={accent} />
              <Text style={[styles.testBtnText, { color: accent }]}>
                {testing ? 'Sending Test...' : 'Send Test Slip'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: accent }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Ionicons name="save-outline" size={16} color="#111827" />
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Printer Config'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 660,
    maxHeight: '90%',
    backgroundColor: '#161618',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  closeIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: 16,
  },
  guaranteeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    marginBottom: 16,
  },
  guaranteeText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  sectionLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  modeCard: {
    flex: 1,
    minWidth: 170,
    backgroundColor: '#1F1F23',
    borderWidth: 1,
    borderColor: '#2E2E32',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  modeTitle: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  modeSub: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 15,
  },
  panel: {
    backgroundColor: '#1C1C1F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C30',
    padding: 14,
    marginBottom: 12,
  },
  agentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  statusDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  agentStatusTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  agentStatusSub: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  downloadBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  stepsBox: {
    backgroundColor: '#141416',
    borderRadius: 8,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  stepsHeading: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepLine: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 17,
  },
  codeInline: {
    color: '#FDE68A',
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  printerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
  },
  printerChipText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  inputLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#FFFFFF',
    fontSize: 13,
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  feedbackOk: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  feedbackWarn: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.4)',
  },
  feedbackErr: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  feedbackText: {
    color: '#F3F4F6',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3F3F46',
    backgroundColor: '#27272A',
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
});
