export default class psUnityWidget {
  constructor(page) {
    this.page = page;
    this.unityWidgetContainer = page.locator('.upload.upload-block.con-block.unity-enabled');
    this.unityVideo = this.unityWidgetContainer.locator('.video-container.video-holder').nth(0);
    this.dropZone = this.unityWidgetContainer.locator('.drop-zone-container').nth(0);
    this.dropZoneText = this.dropZone.locator('//div[@class="drop-zone-container"]/div[@class="drop-zone"]/p[1]').nth(2);
    this.dropZoneFileText = this.dropZone.locator('//div[@class="drop-zone-container"]/div[@class="drop-zone"]/p[2]').nth(2);
    this.fileUploadCta = this.unityWidgetContainer.locator('.con-button.blue.action-button.button-xl').nth(2);
    this.legelTerms = this.unityWidgetContainer.locator('//a[@daa-ll="Terms of Use-11--"]');
    this.privacyPolicy = this.unityWidgetContainer.locator('//a[@daa-ll="Privacy Policy-12--"]');
    this.splashScreen = this.unityWidgetContainer.locator('//div[@class="fragment splash -loader show" and @style="display: none"]');
    
  }
}
