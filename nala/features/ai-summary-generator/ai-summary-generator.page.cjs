import AcrobatWidget from '../../widget/acrobat-widget.cjs';

export default class AiSummaryGenerator extends AcrobatWidget {
  constructor(page, nth = 0) {
    super(page, '.summarize-pdf.unity-enabled', nth);
  }
}
