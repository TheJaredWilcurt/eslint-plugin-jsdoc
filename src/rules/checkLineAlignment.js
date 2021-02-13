import { transforms } from 'comment-parser';
import { rewireSpecs } from 'comment-parser/lib/util';
import { cloneDeep } from 'lodash';
import iterateJsdoc from '../iterateJsdoc.js';

const commentAlign = transforms.align;
const commentFlow = transforms.flow;
const commentIndent = transforms.indent;

const checkNotAlignedPerTag = function (utils, tag) {
  /*
    start +
    delimiter +
    postDelimiter +
    tag +
    postTag +
    type +
    postType +
    name +
    postName +
    description +
    end
   */
  let spacerProps;
  let contentProps;
  const mightHaveNamepath = utils.tagMightHaveNamepath(tag.tag);
  if (mightHaveNamepath) {
    spacerProps = ['postDelimiter', 'postTag', 'postType', 'postName'];
    contentProps = ['tag', 'type', 'name', 'description'];
  } else {
    spacerProps = ['postDelimiter', 'postTag', 'postType'];
    contentProps = ['tag', 'type', 'description'];
  }

  const tokens = tag.source[0]?.tokens;

  const followedBySpace = function (index, callback) {
    const nextIndex = index + 1;

    return spacerProps.slice(nextIndex).some(function (spacerProp, innerIndex) {
      const contentProp = contentProps[nextIndex + innerIndex];

      const spacePropVal = tokens[spacerProp];

      const ret = spacePropVal;

      if (callback) {
        callback(!ret, contentProp);
      }

      return ret;
    });
  };

  // If checking alignment on multiple lines, need to check other `source`
  //   items
  // Go through `post*` spacing properties and exit to indicate problem if
  //   extra spacing detected
  const ok = !spacerProps.some(function (spacerProp, index) {
    const contentProp = contentProps[index];
    const contentPropValue = tokens[contentProp];
    const spacerPropValue = tokens[spacerProp];

    // There will be extra alignment if...
    // There is a (single) space, no immediate content, and yet another space is found subsequently (not separated by intervening content)
    const singleSpaceNoImmediateContentSubsequentSpace = spacerPropValue && !contentPropValue && followedBySpace(index);
    const extraWhitespacInASingleSpacerSegment = spacerPropValue.length > 1;

    return extraWhitespacInASingleSpacerSegment || singleSpaceNoImmediateContentSubsequentSpace;
  });
  if (ok) {
    return;
  }
  const fix = function () {
    spacerProps.forEach(function (spacerProp, index) {
      const contentProp = contentProps[index];
      const contentPropValue = tokens[contentProp];

      if (contentPropValue) {
        tokens[spacerProp] = ' ';
        followedBySpace(index, function (hasSpace, contentPrp) {
          if (hasSpace) {
            tokens[contentPrp] = '';
          }
        });
      } else {
        tokens[spacerProp] = '';
      }
    });

    utils.setTag(tag, tokens);
  };
  utils.reportJSDoc('Expected JSDoc block lines to not be aligned.', tag, fix, true);
};

const filterApplicableTags = function (jsdoc, applicableTags) {
  const filteredJsdoc = {
    ...jsdoc,
    source: jsdoc.source.filter(function (source) {
      if (source.tokens.tag === '') {
        return true;
      }

      return applicableTags.includes(source.tokens.tag.replace('@', ''));
    }),
    tags: jsdoc.tags.filter(function (tag) {
      return applicableTags.includes(tag.tag);
    }),
  };

  return rewireSpecs(filteredJsdoc);
};

const getJsondocFormatted = function ({ applicableTags, indent, jsdoc, utils }) {
  // It needs to be cloned. Otherwise, the transform overrides the original object.
  const jsdocClone = cloneDeep(jsdoc);
  const transform = commentFlow(commentAlign(), commentIndent(indent.length));
  const filteredClone = filterApplicableTags(jsdocClone, applicableTags);
  const transformedJsdoc = transform(filteredClone);
  const formatted = utils.stringify(transformedJsdoc);
  const parsed = utils.commentParser({value: formatted}, indent, false);

  console.log(commentFlow(commentAlign())(parsed));

  return commentFlow(commentAlign())(parsed);
};

const isTagSourcesEqual = function (tag, otherTag) {
  return tag.source.every(function (source, index) {
    return source.source === otherTag.source[index].source;
  });
};

const getFormattedSource = function (tag, formattedTag) {
  return formattedTag.source.map(function (source, index) {
    return {
      ...source,
      number: tag.source[index].number
    };
  });
};

const checkAlignment = function ({ applicableTags, foundTags, indent, jsdoc, utils }) {
  const jsdocFormatted = getJsondocFormatted({
    applicableTags,
    indent,
    jsdoc,
    utils
  });

  foundTags.forEach(function (tag, index) {
    const formattedTag = jsdocFormatted.tags[index];
    if (!isTagSourcesEqual(tag, formattedTag)) {
      const fix = function () {
        const formattedSource = getFormattedSource(tag, formattedTag);
        utils.replaceTagSource(tag, formattedSource);
      };
      utils.reportJSDoc('Expected JSDoc block lines to be aligned.', tag, fix, true);
    }
  });
};

const iterator = function ({ indent, jsdoc, jsdocNode, context, utils }) {
  const userTags = context.options?.[1]?.tags;
  const defaultTags = [
    'param',
    'arg',
    'argument',
    'property',
    'prop',
    'returns',
    'return'
  ];
  const applicableTags = userTags || defaultTags;

  const foundTags = utils.getPresentTags(applicableTags);

  if (context.options[0] === 'always') {
    // Skip if it contains only a single line.
    if (!jsdocNode.value.includes('\n')) {
      return;
    }

    checkAlignment({
      applicableTags,
      foundTags,
      indent,
      jsdoc,
      utils
    });

    return;
  }

  foundTags.forEach(function (tag) {
    checkNotAlignedPerTag(utils, tag);
  });
}

const ruleConfig = {
  iterateAllJsdocs: true,
  meta: {
    type: 'layout',
    docs: {
      description: 'Reports invalid alignment of JSDoc block lines.',
      url: 'https://github.com/gajus/eslint-plugin-jsdoc#eslint-plugin-jsdoc-rules-check-line-alignment',
    },
    fixable: 'whitespace',
    schema: [
      {
        type: 'string',
        enum: ['always', 'never']
      },
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'string'
            }
          }
        }
      }
    ]
  }
};

export default iterateJsdoc(iterator, ruleConfig);
