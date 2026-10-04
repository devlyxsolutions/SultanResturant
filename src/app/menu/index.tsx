import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore } from '../../store/restaurantStore';

export default function CustomerMenuScreen() {
  const router = useRouter();
  const menuItems = useRestaurantStore(state => state.menuItems);
  const categories = useRestaurantStore(state => state.categories);
  const [activeCat, setActiveCat] = useState('All');
  
  // Adding random images for visual appeal if not provided in store
  const getFallbackImage = (category: string) => {
    switch (category) {
      case 'Mains': return 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500&q=80';
      case 'Appetizers': return 'https://images.unsplash.com/photo-1577906096429-f73c2c312435?w=500&q=80';
      case 'Desserts': return 'https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=500&q=80';
      case 'Drinks': return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&q=80';
      default: return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&q=80';
    }
  };

  const filteredItems = activeCat === 'All'
    ? menuItems
    : menuItems.filter(item => item.category === activeCat);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Image 
            source={{ uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1000&q=80' }} 
            style={styles.heroImage} 
          />
          <View style={styles.heroOverlay}>
            <TouchableOpacity style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTitle}>{"Sultan's Dine"}</Text>
              <Text style={styles.heroSubtitle}>A Royal Culinary Experience</Text>
            </View>
          </View>
        </View>

        {/* Sticky Categories Bar */}
        <View style={styles.categoriesWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
            {['All', ...categories].map(cat => (
              <TouchableOpacity 
                key={cat}
                style={[styles.catBadge, activeCat === cat && styles.catBadgeActive]}
                onPress={() => setActiveCat(cat)}
              >
                <Text style={[styles.catText, activeCat === cat && styles.catTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          <Text style={styles.sectionTitle}>{activeCat} Menu</Text>
          
          <View style={styles.grid}>
            {filteredItems.map(item => (
              <View key={item.id} style={styles.menuCard}>
                <Image source={{ uri: getFallbackImage(item.category) }} style={styles.itemImage} />
                <View style={styles.itemContent}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemPrice}>Rs. {item.price.toFixed(0)}</Text>
                  </View>
                  <Text style={styles.itemDesc} numberOfLines={2}>Delicious {item.name.toLowerCase()} prepared fresh.</Text>
                  
                  <TouchableOpacity style={styles.addBtn}>
                    <Ionicons name="add" size={20} color="#D5A943" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  heroSection: {
    height: 300,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(74, 18, 26, 0.6)', // Sultan Burgundy Overlay
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextContainer: {
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: '900',
    color: '#D5A943', // Sultan Gold
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 1,
  },
  categoriesWrapper: {
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }
    }),
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  catBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  catBadgeActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  catText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  catTextActive: {
    color: '#D5A943',
  },
  menuContainer: {
    padding: 20,
    maxWidth: 1000,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: 60,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 20,
  },
  menuCard: {
    width: Platform.OS === 'web' ? '48%' : '100%',
    minWidth: 300,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  itemImage: {
    width: 120,
    height: 120,
  },
  itemContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#4a121a',
  },
  itemDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 8,
  },
  addBtn: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fffdf5',
    borderWidth: 1,
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  }
});
