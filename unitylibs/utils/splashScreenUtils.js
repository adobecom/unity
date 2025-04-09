import { getUnityLibs } from '../scripts/utils.js';

export async function showSplashScreen(splashScreenEl, initActionListeners, loaderLimit, workflowCfg, displayOn = false) {
  try {
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    const transitionScreen = new TransitionScreen(splashScreenEl, initActionListeners, loaderLimit, workflowCfg);
    await transitionScreen.showSplashScreen(displayOn);
    return transitionScreen;
  } catch (error) {
    console.error('Error showing splash screen:', error);
  }
}