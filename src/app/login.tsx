import WelcomeScreen from './index';

export default function LoginScreen() {
  // Directly render the interactive split-login portal with zero redirect hop
  return <WelcomeScreen forceLogin />;
}
