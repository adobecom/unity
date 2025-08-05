import PhotoshopWidget from '../../../widget/photoshop-widget.cjs';

export default class RemoveBackground extends PhotoshopWidget {
  constructor(page, nth = 0) {
    super(page, '.upload.unity-enabled', nth);
  }
}
