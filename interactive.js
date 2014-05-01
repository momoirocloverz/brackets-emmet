/**
 * Definition of interactive functions: the function
 * that require additional dialog prompt and update
 * editor content when user types data in prompt
 */
define(function(require, exports, module) {
	var utils       = require('emmet/utils/common');
	var editorUtils = require('emmet/utils/editor');
	var actionUtils = require('emmet/utils/action');

	var range       = require('emmet/assets/range');
	var htmlMatcher = require('emmet/assets/htmlMatcher');
	var parser      = require('emmet/parser/abbreviation');
	var updateTag   = require('emmet/action/updateTag');

	var prompt = require('./prompt');

	/**
	 * Caches wrapping context for current selection in editor
	 * @param  {IEmmetEditor} editor 
	 * @param  {Object} info Current editor info (content, syntax, etc.) 
	 * @return {Object}
	 */
	function selectionContext(editor, info) {
		info = info || editorUtils.outputInfo(editor);
		return editor.selectionList().map(function(sel, i) {
			editor.selectionIndex = i;
			
			var r = range(editor.getSelectionRange());
			var tag = htmlMatcher.tag(info.content, r.start);
			if (!r.length() && tag) {
				// no selection, use tag pair
				r = utils.narrowToNonSpace(info.content, tag.range);
			}

			var out = {
				selection: r,
				tag: tag,
				caret: r.start,
				syntax: info.syntax,
				profile: info.profile || null,
				counter: editor.selectionIndex + 1,
				contextNode: actionUtils.captureContext(editor, r.start)
			};

			if (r.length()) {
				out.pastedContent = utils.escapeText(r.substring(info.content));
			}

			return out;
		});
	}

	function updateCarets(selCtx, fromIndex, delta) {
		for (var i = fromIndex + 1, il = selCtx.length; i < il; i++) {
			selCtx[i].caret += delta;
		}
	}

	function resetCarets(selCtx) {
		selCtx.forEach(function(ctx) {
			ctx.caret = ctx.selection.start;
		});
	}

	function restore(editor, selCtx) {
		if (selCtx) {
			for (var i = selCtx.length - 1; i >= 0; i--) {
				editor.selectionIndex = i;
				editor.setCaretPos(selCtx[i].caret);
			}
		}
		editor.editor.focus();
	}

	return {
		wrapWithAbbreviation: function(editor) {
			// first we have to cache context for each selection
			var selCtx = selectionContext(editor);

			// show prompt dialog that will wrap each selection
			// on user typing
			prompt.show({
				label: 'Enter Abbreviation',
				editor: editor.editor,
				update: function(abbr) {
					var result, replaced;
					resetCarets(selCtx);
					for (var i = selCtx.length - 1, ctx; i >= 0; i--) {
						ctx = selCtx[i];
						result = '';
						try {
							result = parser.expand(abbr, ctx);
						} catch (e) {
							console.error(e);
						}

						editor.selectionIndex = i;
						replaced = editor.replaceContent(result, ctx.selection.start, ctx.selection.end);
						ctx.caret = editor.getCaretPos();
						updateCarets(selCtx, i, replaced.length - ctx.selection.length());
					}
				},
				confirm: function() {
					restore(editor, selCtx);
				},
				cancel: function() {
					restore(editor, selCtx);
				}
			});
		},

		updateTag: function(editor) {
			var info = editorUtils.outputInfo(editor);
			var selCtx = selectionContext(editor, info);

			// show prompt dialog that will update each
			// tag from selection
			prompt.show({
				label: 'Enter Abbreviation',
				editor: editor.editor,
				update: function(abbr) {
					resetCarets(selCtx);
					var tag, replaced, delta;
					for (var i = selCtx.length - 1, ctx; i >= 0; i--) {
						ctx = selCtx[i];
						tag = null;

						try {
							tag = updateTag.getUpdatedTag(abbr, {match: ctx.tag}, info.content, {
								counter: ctx.counter
							});
						} catch (e) {
							console.error(e);
						}

						if (!tag) {
							continue;
						}

						replaced = [{
							start: ctx.tag.open.range.start, 
							end: ctx.tag.open.range.end,
							content: tag.source
						}];

						if (tag.name() != ctx.tag.name && ctx.tag.close) {
							replaced.unshift({
								start: ctx.tag.close.range.start, 
								end: ctx.tag.close.range.end,
								content: '</' + tag.name() + '>'
							});
						}

						delta = 0;
						editor.selectionIndex = i;
						replaced.forEach(function(data) {
							editor.replaceContent(data.content, data.start, data.end);
							ctx.caret = data.start;
							delta += data.content.length - data.end + data.start;
						});

						updateCarets(selCtx, i, delta);
					}
				},
				confirm: function() {
					restore(editor, selCtx);
				},
				cancel: function() {
					restore(editor, selCtx);
				}
			});
		}
	};
});