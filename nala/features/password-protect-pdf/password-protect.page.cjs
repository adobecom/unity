import AcrobatWidget from '../../widget/acrobat-widget.cjs';

export default class PasswordProtect extends AcrobatWidget {
  constructor(page, nth = 0) {
    super(page, '.protect-pdf.unity-enabled', nth);
  }
}
