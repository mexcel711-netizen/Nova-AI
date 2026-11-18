import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectEmotionFromText,
  extractEmotionAndCleanText,
  formatExpressiveSpeechPrompt,
  resolveActiveAiProvider,
  splitSpeechChunks,
} from './emotionAndSpeech';

test('extractEmotionAndCleanText strips explicit emotion tags and detects fallback emotions', () => {
  const tagged = extractEmotionAndCleanText('[emotion:surprised] Wah! Ye toh kamaal ho gaya!');
  assert.equal(tagged.emotion, 'surprised');
  assert.equal(tagged.cleanText, 'Wah! Ye toh kamaal ho gaya!');

  assert.equal(detectEmotionFromText('Assalamualaikum! Khushi hui aapse baat kar ke.'), 'happy');
  assert.equal(detectEmotionFromText('Mujhe afsos hai, ye task complete nahi ho saka.'), 'sad');
  assert.equal(detectEmotionFromText('Really?! That is unbelievable!'), 'surprised');
  assert.equal(detectEmotionFromText('The current time is 09:30 AM.'), 'calm');
});

test('splitSpeechChunks splits bilingual Urdu and English text cleanly on sentence boundaries', () => {
  const input =
    'السلام علیکم! میں نووا ہوں۔ آج موسم بہت خوشگوار ہے، اور میں آپ کے تمام کاموں میں مدد کے لیے تیار ہوں۔ Let me know what you need next.';
  const chunks = splitSpeechChunks(input, 90);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((c) => c.length <= 90));
});

test('formatExpressiveSpeechPrompt embeds breathing pauses and Pakistani female style direction', () => {
  const res = formatExpressiveSpeechPrompt(
    'Assalamualaikum! Mein NOVA hun. Aaj kya kaam karna hai?',
    'happy'
  );
  assert.ok(res.textWithBreaths.includes('<breath>'));
  assert.ok(res.styleInstruction.toLowerCase().includes('pakistani female'));
});

test('resolveActiveAiProvider prioritizes Cloudflare binding automatically on Cloudflare deploy and Google AI Studio locally', () => {
  const onCloudflare = resolveActiveAiProvider({
    preference: 'auto',
    hasCloudflareBinding: true,
    hasCloudflareRest: false,
    hasGoogleAiKey: false,
  });
  assert.equal(onCloudflare.activeProvider, 'cloudflare-binding');
  assert.equal(onCloudflare.cloudflareBindingActive, true);

  const inAiStudio = resolveActiveAiProvider({
    preference: 'auto',
    hasCloudflareBinding: false,
    hasCloudflareRest: false,
    hasGoogleAiKey: true,
  });
  assert.equal(inAiStudio.activeProvider, 'google-ai-studio');

  const cloudflareOverride = resolveActiveAiProvider({
    preference: 'cloudflare',
    hasCloudflareBinding: false,
    hasCloudflareRest: true,
    hasGoogleAiKey: true,
  });
  assert.equal(cloudflareOverride.activeProvider, 'cloudflare-rest');
});
