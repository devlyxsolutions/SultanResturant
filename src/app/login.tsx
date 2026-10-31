import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const router = useRouter();

  useEffect(() => {
    // Seamlessly forward to the interactive split-login portal
    router.replace('/?login=true' as any);
  }, [router]);

  return null;
}
