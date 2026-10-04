import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#52171B" />
      
      {/* Background Decor */}
      <View style={styles.decorCircleTop} />
      <View style={styles.decorCircleBottom} />

      <View style={styles.content}>
        <View style={styles.cardContainer}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../assets/images/sultan-logo.png')}
              style={[styles.logoImage, isMobile ? styles.logoImageMobile : styles.logoImageDesktop]}
              resizeMode="contain"
            />
          </View>

          <View style={styles.welcomeTextContainer}>
            <Text style={styles.welcomeTitle}>Authentic Dining Experience</Text>
            <Text style={styles.welcomeSubtitle}>
              Taste the royal flavors of the finest cuisine crafted with passion and tradition.
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <Link href="/menu" asChild>
              <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>View Digital Menu</Text>
              </TouchableOpacity>
            </Link>

            <Link href="/login" asChild>
              <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.85}>
                <Text style={styles.secondaryButtonText}>Staff Login</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#52171B', // Sultan Royal Burgundy
  },
  decorCircleTop: {
    position: 'absolute',
    top: -100,
    right: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(213, 169, 67, 0.05)',
  },
  decorCircleBottom: {
    position: 'absolute',
    bottom: -50,
    left: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(213, 169, 67, 0.05)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 520,
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 32,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  logoImage: {
    marginBottom: 10,
  },
  logoImageDesktop: {
    width: 320,
    height: 250,
  },
  logoImageMobile: {
    width: 250,
    height: 200,
  },
  welcomeTextContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 23,
    paddingHorizontal: 16,
    maxWidth: 420,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 440,
    gap: 14,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#D5A943',
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#52171B',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  secondaryButton: {
    backgroundColor: 'rgba(213, 169, 67, 0.08)',
    borderWidth: 2,
    borderColor: '#D5A943',
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#D5A943',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
});
