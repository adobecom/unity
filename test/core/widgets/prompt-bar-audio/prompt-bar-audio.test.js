import { expect } from '@esm-bundle/chai';
import PromptBarAudioWidget from '../../../../unitylibs/core/widgets/prompt-bar-audio/prompt-bar-audio.js';

describe('Audio prompt bar authored model defaults', () => {
  let widget;

  beforeEach(() => {
    const root = document.createElement('div');
    widget = new PromptBarAudioWidget(null, root, {});
    widget.widgetWrap = document.createElement('div');
    widget.hasModelOptions = true;
    widget.selectedVerbType = 'speech';
    widget.models = [
      { id: 'Firefly', name: 'Firefly', module: 'speech', version: '1', icon: '' },
      { id: 'ElevenLabs', name: 'ElevenLabs', module: 'speech', version: '2', icon: '' },
      { id: 'voice-model-v2', name: 'Voice model', module: 'speech', version: '3', icon: '' },
      { id: 'image-model', name: 'Image model', module: 'image', version: '1', icon: '' },
    ];
  });

  function author(marker, text = '') {
    widget.el.innerHTML += `<ul><li><span class="icon ${marker}"></span>${text}</li></ul>`;
  }

  function expectSelection(id) {
    const [button, menu] = widget.modelDropdown();
    const model = widget.models.find((entry) => entry.id === id);
    expect(widget.selectedModelId).to.equal(id);
    expect(widget.selectedModelVersion).to.equal(model.version);
    expect(widget.selectedModelName).to.equal(model.name);
    expect(button.dataset.selectedModelId).to.equal(id);
    expect(button.textContent).to.equal(model.name);
    expect(widget.widgetWrap.dataset.selectedModelId).to.equal(id);
    expect(menu.querySelector('[aria-selected="true"]').dataset.modelId).to.equal(id);
    expect(menu.querySelectorAll('[aria-selected="true"]')).to.have.length(1);
  }

  it('selects a marker default independently of translated row text', () => {
    author('icon-model-default-speech-elevenlabs', 'Translated model name');
    expectSelection('ElevenLabs');
  });

  it('preserves the full hyphenated model ID', () => {
    author('icon-model-default-speech-voice-model-v2');
    expectSelection('voice-model-v2');
  });

  it('uses only the selected verb marker', () => {
    author('icon-model-default-image-image-model');
    author('icon-model-default-speech-elevenlabs');
    expectSelection('ElevenLabs');
    widget.selectedVerbType = 'image';
    expectSelection('image-model');
  });

  it('ignores the old text-value format', () => {
    author('icon-model-speech-default', 'ElevenLabs');
    expectSelection('Firefly');
  });

  it('falls back to the first model when no default is authored', () => {
    expectSelection('Firefly');
  });

  it('falls back to the first model for an unknown default', () => {
    author('icon-model-default-speech-unknown');
    expectSelection('Firefly');
  });

  it('falls back to the first model for an empty marker suffix', () => {
    author('icon-model-default-speech-', 'ElevenLabs');
    expectSelection('Firefly');
  });

  it('does not render a picker when model options are disabled', () => {
    author('icon-model-default-speech-elevenlabs');
    widget.hasModelOptions = false;
    expect(widget.modelDropdown()).to.deep.equal([]);
  });
});
