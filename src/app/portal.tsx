import WelcomeScreen from './index';

/**
 * Staff Portal entry for the public website domain.
 * On the public domain, "/" serves the restaurant website; staff log in at "/portal".
 * On the local POS hub / EXE / tablet app, "/" still opens this same login screen.
 */
export default function PortalScreen() {
  return <WelcomeScreen forceLogin />;
}
