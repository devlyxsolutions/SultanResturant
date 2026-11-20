import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface TouchNumericKeypadProps {
  value: string;
  onChangeText: (nextVal: string) => void;
  onDone?: () => void;
  allowDecimals?: boolean;
  quickAmounts?: number[];
  exactAmount?: number;
  style?: any;
  compact?: boolean;
}

const BRAND = {
  burgundy: '#52171B',
  burgundyLight: '#6B1F24',
  gold: '#B48214',
  goldLight: '#FEF3C7',
  goldDark: '#92400E',
  bgSurface: '#F8FAFC',
  border: '#E2E8F0',
  keyBg: '#FFFFFF',
  keyText: '#0F172A',
  actionKeyBg: '#F1F5F9',
  actionKeyText: '#475569',
  dangerBg: '#FEE2E2',
  dangerText: '#DC2626',
  successBg: '#ECFDF5',
  successText: '#059669',
};

const DEFAULT_QUICK_AMOUNTS = [100, 500, 1000, 5000];

function TouchNumericKeypadComponent({
  value,
  onChangeText,
  onDone,
  allowDecimals = false,
  quickAmounts = DEFAULT_QUICK_AMOUNTS,
  exactAmount,
  style,
  compact = false,
}: TouchNumericKeypadProps) {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 500;

  const handleDigitPress = (digit: string) => {
    const raw = (value || '').trim();
    if (raw === '0' && digit !== '.') {
      onChangeText(digit);
      return;
    }
    if (digit === '.') {
      if (!allowDecimals) return;
      if (raw.includes('.')) return;
      onChangeText(raw ? `${raw}.` : '0.');
      return;
    }
    if (digit === '00') {
      if (!raw || raw === '0') {
        onChangeText('0');
        return;
      }
      onChangeText(raw + '00');
      return;
    }
    onChangeText(raw + digit);
  };

  const handleDelete = () => {
    const raw = (value || '').trim();
    if (raw.length <= 1) {
      onChangeText('');
    } else {
      onChangeText(raw.slice(0, -1));
    }
  };

  const handleClear = () => {
    onChangeText('');
  };

  const handleAddQuickAmount = (amount: number) => {
    const currentNum = parseFloat((value || '0').replace(/[^0-9.]/g, '')) || 0;
    const nextNum = Math.round(currentNum + amount);
    onChangeText(String(nextNum));
  };

  const handleSetExact = () => {
    if (exactAmount !== undefined && exactAmount >= 0) {
      onChangeText(String(Math.round(exactAmount)));
    }
  };

  const keyHeight = compact ? 42 : isSmallScreen ? 46 : 50;

  return (
    <View style={[styles.container, style]}>
      {/* Quick Amount Fast Adder Pills */}
      {quickAmounts && quickAmounts.length > 0 && (
        <View style={styles.quickAddRow}>
          <Text style={styles.quickAddLabel}>Quick Add:</Text>
          {exactAmount !== undefined && (
            <TouchableOpacity
              style={[styles.quickAddPill, styles.exactPill]}
              onPress={handleSetExact}
              activeOpacity={0.75}
            >
              <Ionicons name="flash" size={12} color="#B48214" />
              <Text style={styles.exactPillText}>Exact (Rs. {Math.round(exactAmount).toLocaleString()})</Text>
            </TouchableOpacity>
          )}
          {quickAmounts.map((amt) => (
            <TouchableOpacity
              key={amt}
              style={styles.quickAddPill}
              onPress={() => handleAddQuickAmount(amt)}
              activeOpacity={0.75}
            >
              <Text style={styles.quickAddPillText}>+{amt.toLocaleString()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Main Touch Number Grid */}
      <View style={styles.grid}>
        {/* Row 1: 1, 2, 3, CLR */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('1')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('2')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>2</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('3')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>3</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, styles.keyClear, { height: keyHeight }]}
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={17} color={BRAND.dangerText} />
            <Text style={styles.keyClearText}>CLR</Text>
          </TouchableOpacity>
        </View>

        {/* Row 2: 4, 5, 6, DEL */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('4')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>4</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('5')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>5</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('6')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>6</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, styles.keyDelete, { height: keyHeight }]}
            onPress={handleDelete}
            activeOpacity={0.7}
          >
            <Ionicons name="backspace-outline" size={20} color="#52171B" />
          </TouchableOpacity>
        </View>

        {/* Row 3: 7, 8, 9, 00 */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('7')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>7</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('8')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>8</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, { height: keyHeight }]}
            onPress={() => handleDigitPress('9')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>9</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.key, styles.keyDoubleZero, { height: keyHeight }]}
            onPress={() => handleDigitPress('00')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyDoubleZeroText}>00</Text>
          </TouchableOpacity>
        </View>

        {/* Row 4: . or 0, 0, Done */}
        <View style={styles.row}>
          {allowDecimals ? (
            <TouchableOpacity
              style={[styles.key, { height: keyHeight }]}
              onPress={() => handleDigitPress('.')}
              activeOpacity={0.7}
            >
              <Text style={styles.keyText}>.</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.key, styles.keyAction, { height: keyHeight }]}
              onPress={() => handleAddQuickAmount(500)}
              activeOpacity={0.7}
            >
              <Text style={styles.keyActionText}>+500</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.key, { flex: 2, height: keyHeight }]}
            onPress={() => handleDigitPress('0')}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.key, styles.keyDone, { height: keyHeight }]}
            onPress={() => {
              if (onDone) onDone();
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="checkmark-sharp" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export const TouchNumericKeypad = memo(TouchNumericKeypadComponent);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
    marginTop: 8,
    ...Platform.select({
      web: {
        userSelect: 'none',
      } as any,
    }),
  },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  quickAddLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickAddPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  quickAddPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  exactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  exactPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  grid: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  key: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  keyText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  keyClear: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  keyClearText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  keyDelete: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  keyDoubleZero: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  keyDoubleZeroText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
  },
  keyAction: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  keyActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  keyDone: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
});
