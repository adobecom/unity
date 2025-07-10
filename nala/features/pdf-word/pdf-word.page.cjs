import AcrobatWidget from '../../widget/acrobat-widget.cjs';

export default class PdfToWord extends AcrobatWidget {
  constructor(page, nth = 0) {
    super(page, '.pdf-to-word.unity-enabled', nth);
  }
}
