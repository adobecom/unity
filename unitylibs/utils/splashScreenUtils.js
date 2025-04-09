export async function showSplashScreen(transitionScreen, displayOn = false) {
  try {
    if (!transitionScreen) {
      const { default: TransitionScreen } = await import('../scripts/transition-screen.js');
      transitionScreen = new TransitionScreen(
        transitionScreen?.splashScreenEl,
        transitionScreen?.initActionListeners,
        transitionScreen?.LOADER_LIMIT,
        transitionScreen?.workflowCfg
      );
    }
    await transitionScreen.showSplashScreen(displayOn);
  } catch (e) {
    console.error('Error showing splash screen:', e);
  }
}
