import {
    CommentIdentifiersRegex,
    FileVariableDefinitionRegex,
    LineSplitterRegex,
    PromptCommentRegex,
    RequestMetadataRegex,
    RequestVariableDefinitionRegex,
    RequestVariableDefinitionWithNameRegexFactory,
} from '../../src/common/constants';

describe('FileVariableDefinitionRegex', () => {
    it('matches a basic @var = value line', () => {
        expect(FileVariableDefinitionRegex.test('@myVar = hello')).toBe(true);
    });

    it('captures the variable name', () => {
        const match = '@username = john'.match(FileVariableDefinitionRegex);
        expect(match![1]).toBe('username');
    });

    it('captures the value', () => {
        const match = '@host = https://example.com'.match(FileVariableDefinitionRegex);
        expect(match![2]).toBe('https://example.com');
    });

    it('matches with leading whitespace', () => {
        expect(FileVariableDefinitionRegex.test('  @var = value')).toBe(true);
    });

    it('does not match a line without @', () => {
        expect(FileVariableDefinitionRegex.test('var = value')).toBe(false);
    });

    it('does not match a request line', () => {
        expect(FileVariableDefinitionRegex.test('GET https://example.com')).toBe(false);
    });
});

describe('RequestVariableDefinitionRegex', () => {
    it('matches # @name style', () => {
        expect(RequestVariableDefinitionRegex.test('# @name myRequest')).toBe(true);
    });

    it('matches // @name style', () => {
        expect(RequestVariableDefinitionRegex.test('// @name myRequest')).toBe(true);
    });

    it('captures the variable name', () => {
        const match = '# @name createUser'.match(RequestVariableDefinitionRegex);
        expect(match![1]).toBe('createUser');
    });

    it('does not match without @name', () => {
        expect(RequestVariableDefinitionRegex.test('# myRequest')).toBe(false);
    });
});

describe('RequestVariableDefinitionWithNameRegexFactory', () => {
    it('creates a regex that matches a specific name', () => {
        const regex = RequestVariableDefinitionWithNameRegexFactory('getUser');
        expect(regex.test('# @name getUser')).toBe(true);
    });

    it('does not match a different name', () => {
        const regex = RequestVariableDefinitionWithNameRegexFactory('getUser');
        expect(regex.test('# @name createUser')).toBe(false);
    });
});

describe('CommentIdentifiersRegex', () => {
    it('matches lines starting with #', () => {
        expect(CommentIdentifiersRegex.test('# comment')).toBe(true);
    });

    it('matches lines starting with //', () => {
        expect(CommentIdentifiersRegex.test('// comment')).toBe(true);
    });

    it('matches lines with leading whitespace before #', () => {
        expect(CommentIdentifiersRegex.test('  # comment')).toBe(true);
    });

    it('does not match regular request lines', () => {
        expect(CommentIdentifiersRegex.test('GET https://example.com')).toBe(false);
    });

    it('does not match empty lines', () => {
        expect(CommentIdentifiersRegex.test('')).toBe(false);
    });
});

describe('RequestMetadataRegex', () => {
    it('matches # @key style', () => {
        expect(RequestMetadataRegex.test('# @name myRequest')).toBe(true);
    });

    it('captures the key', () => {
        const match = '# @name myRequest'.match(RequestMetadataRegex);
        expect(match![1]).toBe('name');
    });

    it('captures the value', () => {
        const match = '# @name myRequest'.match(RequestMetadataRegex);
        expect(match![2]).toBe('myRequest');
    });

    it('matches // @key style', () => {
        expect(RequestMetadataRegex.test('// @no-redirect')).toBe(true);
    });

    it('matches with leading whitespace', () => {
        expect(RequestMetadataRegex.test('  # @note some note')).toBe(true);
    });

    it('does not match plain comment lines', () => {
        expect(RequestMetadataRegex.test('# just a comment')).toBe(false);
    });
});

describe('PromptCommentRegex', () => {
    it('matches # @prompt varName', () => {
        expect(PromptCommentRegex.test('# @prompt username')).toBe(true);
    });

    it('captures the variable name', () => {
        const match = '# @prompt username'.match(PromptCommentRegex);
        expect(match![1]).toBe('username');
    });

    it('captures optional description', () => {
        const match = '# @prompt username Enter your username'.match(PromptCommentRegex);
        expect(match![1]).toBe('username');
        expect(match![2]).toBe('Enter your username');
    });

    it('matches // @prompt style', () => {
        expect(PromptCommentRegex.test('// @prompt password')).toBe(true);
    });

    it('does not match # @name', () => {
        expect(PromptCommentRegex.test('# @name myRequest')).toBe(false);
    });
});

describe('LineSplitterRegex', () => {
    it('splits on \\n', () => {
        expect('a\nb'.split(LineSplitterRegex)).toEqual(['a', 'b']);
    });

    it('splits on \\r\\n', () => {
        expect('a\r\nb'.split(LineSplitterRegex)).toEqual(['a', 'b']);
    });

    it('splits mixed line endings', () => {
        expect('a\nb\r\nc'.split(LineSplitterRegex)).toEqual(['a', 'b', 'c']);
    });
});
