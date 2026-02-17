// Sentry utilities for shared environment (browser extension)
// Following: https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/

let sentryClient = null;
let sentryScope = null;

/**
 * Initialize Sentry for browser extension (shared environment)
 * Uses manual client setup to avoid polluting global state
 */
function initSentry() {
  try {
    // Create a new client manually (don't use Sentry.init())
    const integrations = Sentry.getDefaultIntegrations().filter(integration => {
      // Filter out integrations that access global/shared state
      const integrationName = integration.name;
      return ![
        'BrowserApiErrors',
        'BrowserSession',
        'Breadcrumbs',
        'ConversationId',
        'FunctionToString'
      ].includes(integrationName);
    });

    sentryClient = new Sentry.BrowserClient({
      dsn: 'https://71261707f142acf14577ee1a940f6d26@o4510755458711552.ingest.us.sentry.io/4510902147678208',
      environment: 'production',
      integrations: integrations,
      transport: Sentry.makeFetchTransport,
      stackParser: Sentry.defaultStackParser,
      // Don't capture unhandled errors globally (we'll use try-catch)
      autoSessionTracking: false
    });

    sentryScope = new Sentry.Scope();
    sentryScope.setClient(sentryClient);
    sentryClient.init();

    console.log('✅ Sentry initialized for PR Hopper');
    return true;
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
    return false;
  }
}

/**
 * Capture an exception with context
 * @param {Error} error - The error to capture
 * @param {Object} context - Additional context
 */
function captureException(error, context = {}) {
  if (!sentryScope || !sentryClient) {
    console.error('Sentry not initialized, error not sent:', error);
    return;
  }

  try {
    // Add context as tags/extras
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        sentryScope.setTag(key, value);
      });
    }
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        sentryScope.setExtra(key, value);
      });
    }

    sentryScope.captureException(error);
  } catch (err) {
    console.error('Failed to capture exception:', err);
  }
}

/**
 * Capture a message for tracking
 * @param {string} message - The message to capture
 * @param {string} level - Severity level (info, warning, error)
 * @param {Object} context - Additional context
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!sentryScope || !sentryClient) {
    console.log('Sentry not initialized, message not sent:', message);
    return;
  }

  try {
    // Add context as tags/extras
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        sentryScope.setTag(key, value);
      });
    }
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        sentryScope.setExtra(key, value);
      });
    }

    sentryScope.captureMessage(message, level);
  } catch (err) {
    console.error('Failed to capture message:', err);
  }
}

/**
 * Set user context
 * @param {Object} user - User information
 */
function setUser(user) {
  if (sentryScope) {
    sentryScope.setUser(user);
  }
}

// Export functions for use in other modules
if (typeof window !== 'undefined') {
  window.SentryUtils = {
    initSentry,
    captureException,
    captureMessage,
    setUser
  };
}
