// Custom entry point (https://docs.expo.dev/router/installation/): background tasks must be
// defined in the global scope of a module loaded before the app, because the OS can start the JS
// bundle without any UI to run a notification action or the periodic sync.
import './src/notifications/backgroundTasks';

// Always last: registers the app through Expo Router.
import 'expo-router/entry';
