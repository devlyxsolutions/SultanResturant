import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '../constants/brand';

export interface PaginationControlProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  itemName?: string;
  isCompact?: boolean;
}

export default function PaginationControl({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  itemName = 'records',
  isCompact = false,
}: PaginationControlProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with smart ellipsis
  const pageNumbers = useMemo<(number | string)[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }

    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [currentPage, totalPages]);

  if (totalItems === 0) {
    return null;
  }

  return (
    <View style={[styles.container, isMobile && styles.containerMobile, isCompact && styles.containerCompact]}>
      {/* Left Info: Current Range & Optional Page Size */}
      <View style={[styles.infoSection, isMobile && styles.infoSectionMobile]}>
        <View style={styles.summaryBadge}>
          <Ionicons name="layers-outline" size={13} color={BRAND.burgundy} style={{ marginRight: 5 }} />
          <Text style={styles.summaryText}>
            Showing <Text style={styles.boldText}>{startItem}</Text>-<Text style={styles.boldText}>{endItem}</Text> of <Text style={styles.boldText}>{totalItems}</Text> {itemName}
          </Text>
        </View>

        {onPageSizeChange && pageSizeOptions && pageSizeOptions.length > 0 && (
          <View style={styles.pageSizeRow}>
            <Text style={styles.pageSizeLabel}>Rows:</Text>
            {pageSizeOptions.map((opt) => {
              const isSelected = pageSize === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pageSizeBtn, isSelected && styles.pageSizeBtnActive]}
                  onPress={() => onPageSizeChange(opt)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pageSizeBtnText, isSelected && styles.pageSizeBtnTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Right Controls: Navigation Buttons */}
      {totalPages > 1 && (
        <View style={[styles.navSection, isMobile && styles.navSectionMobile]}>
          {/* First Page */}
          <TouchableOpacity
            style={[styles.navBtn, currentPage <= 1 && styles.navBtnDisabled]}
            disabled={currentPage <= 1}
            onPress={() => onPageChange(1)}
            activeOpacity={0.7}
          >
            <Ionicons name="play-back" size={13} color={currentPage <= 1 ? '#9CA3AF' : BRAND.burgundy} />
          </TouchableOpacity>

          {/* Previous Page */}
          <TouchableOpacity
            style={[styles.navBtn, currentPage <= 1 && styles.navBtnDisabled]}
            disabled={currentPage <= 1}
            onPress={() => onPageChange(currentPage - 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={15} color={currentPage <= 1 ? '#9CA3AF' : BRAND.burgundy} />
          </TouchableOpacity>

          {/* Page Numbers */}
          <View style={styles.pageNumbersRow}>
            {pageNumbers.map((p, idx) => {
              if (p === '...') {
                return (
                  <View key={`dots-${idx}`} style={styles.ellipsisWrap}>
                    <Text style={styles.ellipsisText}>•••</Text>
                  </View>
                );
              }

              const pageNum = Number(p);
              const isActive = pageNum === currentPage;

              return (
                <TouchableOpacity
                  key={`page-${pageNum}`}
                  style={[styles.pageBtn, isActive && styles.pageBtnActive]}
                  onPress={() => onPageChange(pageNum)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pageBtnText, isActive && styles.pageBtnTextActive]}>
                    {pageNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Next Page */}
          <TouchableOpacity
            style={[styles.navBtn, currentPage >= totalPages && styles.navBtnDisabled]}
            disabled={currentPage >= totalPages}
            onPress={() => onPageChange(currentPage + 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={15} color={currentPage >= totalPages ? '#9CA3AF' : BRAND.burgundy} />
          </TouchableOpacity>

          {/* Last Page */}
          <TouchableOpacity
            style={[styles.navBtn, currentPage >= totalPages && styles.navBtnDisabled]}
            disabled={currentPage >= totalPages}
            onPress={() => onPageChange(totalPages)}
            activeOpacity={0.7}
          >
            <Ionicons name="play-forward" size={13} color={currentPage >= totalPages ? '#9CA3AF' : BRAND.burgundy} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginTop: 14,
    marginBottom: 10,
    gap: 12,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(82, 20, 28, 0.04)',
      } as any,
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  containerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  containerCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  infoSectionMobile: {
    justifyContent: 'space-between',
    width: '100%',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  boldText: {
    fontWeight: '800',
    color: BRAND.ink,
  },
  pageSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageSizeLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#6B7280',
    marginRight: 2,
  },
  pageSizeBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 28,
    alignItems: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  pageSizeBtnActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  pageSizeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  pageSizeBtnTextActive: {
    color: BRAND.gold,
    fontWeight: '900',
  },
  navSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  navSectionMobile: {
    justifyContent: 'center',
    width: '100%',
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer', transition: 'all 0.15s ease' } as any,
    }),
  },
  navBtnDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    opacity: 0.5,
    ...Platform.select({
      web: { cursor: 'not-allowed' } as any,
    }),
  },
  pageNumbersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageBtn: {
    minWidth: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    ...Platform.select({
      web: { cursor: 'pointer', transition: 'all 0.15s ease' } as any,
    }),
  },
  pageBtnActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 6px rgba(82, 20, 28, 0.25)',
      } as any,
    }),
  },
  pageBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#374151',
  },
  pageBtnTextActive: {
    color: BRAND.gold,
    fontWeight: '900',
  },
  ellipsisWrap: {
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ellipsisText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
