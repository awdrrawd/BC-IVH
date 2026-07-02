import js from '@eslint/js';
import globals from 'globals';

// Bondage Club runtime globals that IVH reads/hooks. Listed as read-only so the
// `no-undef` rule can catch genuinely missing cross-module imports of our own
// symbols (Rollup silently treats those as globals otherwise).
const bcGlobals = [
  'Player', 'ChatRoomCharacter', 'ChatRoomCharacterViewOffset', 'CurrentScreen',
  'TranslationLanguage', 'CharacterSetFacialExpression', 'CharacterNickname',
  'CharacterRefresh', 'CharacterLoadCanvas', 'MainCanvas', 'DrawButton', 'DrawText',
  'DrawTextFit', 'DrawImage', 'DrawImageResize', 'DrawCharacter', 'DrawRect',
  'DrawEmptyRect', 'DrawCircle', 'DrawBackNextButton', 'MouseIn', 'MouseX', 'MouseY',
  'ServerSend', 'ServerAccountUpdate', 'ServerPlayerExtensionSettingsSync',
  'ChatRoomSendChat', 'ChatRoomSendEmote', 'ChatRoomSendLocal', 'ChatRoomCharacterViewDrawOverlay',
  'ChatRoomRun', 'ChatRoomLeave', 'ChatRoomHideElements', 'PreferenceRegisterExtensionSetting',
  'PreferenceExit', 'CommandCombine', 'CommandExecute', 'LZString', 'bcModSdk',
  'InformationSheetRun', 'InformationSheetClick', 'InformationSheetExit', 'InformationSheetUnload',
  'InformationSheetSelfExit', 'OrgasmStage', 'PreferenceScreen', 'ElementCreateInput',
  'ElementValue', 'ElementRemove', 'ElementPosition', 'GameVersion', 'Localization',
  'AssetGroup', 'Asset', 'InventoryGet', 'DialogFocusItem', 'TextGet',
  'ActivitySetArousal', 'AssetGroupGet', 'ChatRoomMessage', 'DrawTextWrap',
  'InformationSheetSelection', 'PreferenceSubscreenExtensionsOpen',
  'AssetGetActivity', 'ActivityRun', 'ActivityCanBeDone', 'DrawFlashScreen',
  'ChatRoomTargetMemberNumber',
  'CharacterAppearanceXOffset', 'CharacterAppearanceYOffset', 'ServerPlayerIsInChatRoom',
  'CanvasUpperOverflow', 'DrawImageEx', 'CurrentTime', 'CommonGetFont', 'CurrentModule',
  'CurrentCharacter', 'ChatRoomMapViewIsActive', 'ChatRoomHideIconState', 'CommonPhotoMode',
];

export default [
  { ignores: ['dist/**', 'node_modules/**', 'legacy/**', 'loader.user.js', 'loader.local.user.js', 'scripts/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...Object.fromEntries(bcGlobals.map(g => [g, 'readonly'])),
        __IVH_VERSION__: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
      'no-cond-assign': 'off',
    },
  },
];
