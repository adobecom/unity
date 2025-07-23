import { expect } from '@esm-bundle/chai';
import flattenObject from '../../unitylibs/utils/ObjectUtils.js';

describe('ObjectUtils', () => {
  describe('flattenObject', () => {
    describe('Basic functionality', () => {
      it('should flatten a simple nested object', () => {
        const input = {
          user: {
            name: 'John',
            age: 30,
          },
        };
        const expected = {
          'user.name': 'John',
          'user.age': 30,
        };
        const result = flattenObject(input);
        expect(result).to.deep.equal(expected);
      });

      it('should handle deeply nested objects', () => {
        const input = { level1: { level2: { level3: { value: 'deep' } } } };
        const expected = { 'level1.level2.level3.value': 'deep' };
        const result = flattenObject(input);
        expect(result).to.deep.equal(expected);
      });

      it('should handle primitive values', () => {
        const input = {
          string: 'hello',
          number: 42,
          boolean: true,
        };
        const expected = {
          string: 'hello',
          number: 42,
          boolean: true,
        };
        const result = flattenObject(input);
        expect(result).to.deep.equal(expected);
      });
    });

    describe('Array handling', () => {
      it('should flatten arrays by default', () => {
        const input = { items: ['first', 'second', { nested: 'value' }] };
        const expected = {
          'items.0': 'first',
          'items.1': 'second',
          'items.2.nested': 'value',
        };
        const result = flattenObject(input);
        expect(result).to.deep.equal(expected);
      });

      it('should not flatten arrays when includeArrays is false', () => {
        const input = { items: ['first', 'second'] };
        const expected = { items: '[Array(2)]' };
        const result = flattenObject(input, { includeArrays: false });
        expect(result).to.deep.equal(expected);
      });

      it('should handle empty arrays', () => {
        const input = { empty: [] };
        const expected = { empty: '[Array(0)]' };
        const result = flattenObject(input, { includeArrays: false });
        expect(result).to.deep.equal(expected);
      });
    });

    describe('Options handling', () => {
      it('should use custom separator', () => {
        const input = { user: { name: 'John' } };
        const expected = { 'user|name': 'John' };
        const result = flattenObject(input, { separator: '|' });
        expect(result).to.deep.equal(expected);
      });

      it('should use custom prefix', () => {
        const input = { name: 'John' };
        const expected = { 'root.name': 'John' };
        const result = flattenObject(input, { prefix: 'root' });
        expect(result).to.deep.equal(expected);
      });

      it('should respect maxDepth limit', () => {
        const input = { level1: { level2: { level3: { value: 'deep' } } } };
        const expected = { 'level1.level2': '[Max Depth Reached]' };
        const result = flattenObject(input, { maxDepth: 2 });
        expect(result).to.deep.equal(expected);
      });

      it('should exclude specified types', () => {
        const input = {
          string: 'hello',
          func: () => 'test',
          number: 42,
        };
        const expected = {
          string: 'hello',
          func: '[function]',
          number: 42,
        };
        const result = flattenObject(input);
        expect(result).to.deep.equal(expected);
      });

      it('should exclude custom types', () => {
        const input = {
          string: 'hello',
          number: 42,
          boolean: true,
        };
        const expected = {
          string: 'hello',
          number: '[number]',
          boolean: '[boolean]',
        };
        const result = flattenObject(input, { excludeTypes: ['number', 'boolean'] });
        expect(result).to.deep.equal(expected);
      });
    });

    describe('Null and undefined handling', () => {
      it('should skip null values by default', () => {
        const input = {
          valid: 'value',
          nullValue: null,
          undefinedValue: undefined,
        };
        const expected = { valid: 'value' };
        const result = flattenObject(input);
        expect(result).to.deep.equal(expected);
      });

      it('should preserve null values when preserveNull is true', () => {
        const input = {
          valid: 'value',
          nullValue: null,
          undefinedValue: undefined,
        };
        const expected = {
          valid: 'value',
          nullValue: null,
          undefinedValue: undefined,
        };
        const result = flattenObject(input, { preserveNull: true });
        expect(result).to.deep.equal(expected);
      });

      it('should handle null input', () => {
        const result = flattenObject(null);
        expect(result).to.deep.equal({});
      });

      it('should handle null input with preserveNull', () => {
        const result = flattenObject(null, { preserveNull: true });
        expect(result).to.deep.equal({ value: null });
      });

      it('should handle undefined input', () => {
        const result = flattenObject(undefined);
        expect(result).to.deep.equal({});
      });
    });

    describe('Non-object inputs', () => {
      it('should handle string input', () => {
        const result = flattenObject('hello');
        expect(result).to.deep.equal({ value: 'hello' });
      });

      it('should handle number input', () => {
        const result = flattenObject(42);
        expect(result).to.deep.equal({ value: 42 });
      });

      it('should handle boolean input', () => {
        const result = flattenObject(true);
        expect(result).to.deep.equal({ value: true });
      });

      it('should use prefix for non-object inputs', () => {
        const result = flattenObject('hello', { prefix: 'text' });
        expect(result).to.deep.equal({ text: 'hello' });
      });
    });

    describe('Circular reference handling', () => {
      it('should handle circular references', () => {
        const input = { name: 'parent' };
        input.self = input; // Create circular reference

        const result = flattenObject(input);
        expect(result).to.have.property('name', 'parent');
        expect(result).to.have.property('self', '[Circular Reference]');
      });

      it('should handle nested circular references', () => {
        const parent = { name: 'parent' };
        const child = { name: 'child', parent };
        parent.child = child; // Create circular reference

        const input = { root: parent };
        const result = flattenObject(input);

        expect(result).to.have.property('root.name', 'parent');
        expect(result).to.have.property('root.child.name', 'child');
        expect(result).to.have.property('root.child.parent', '[Circular Reference]');
      });
    });

    describe('Error object handling', () => {
      it('should flatten Error objects with non-enumerable properties', () => {
        const error = new Error('Test error');
        error.customProp = 'custom';

        const input = { error };
        const result = flattenObject(input);

        expect(result).to.have.property('error.message', 'Test error');
        expect(result).to.have.property('error.customProp', 'custom');
        expect(result).to.have.property('error.stack');
        // Note: 'name' is inherited from Error.prototype, not an own property
      });

      it('should handle nested Error objects', () => {
        const error = new Error('Nested error');
        const input = {
          exception: {
            cause: error,
            message: 'Something went wrong',
          },
        };

        const result = flattenObject(input);

        expect(result).to.have.property('exception.message', 'Something went wrong');
        expect(result).to.have.property('exception.cause.message', 'Nested error');
        expect(result).to.have.property('exception.cause.stack');
        // Note: 'name' is inherited from Error.prototype, not an own property
      });
    });

    describe('Complex scenarios', () => {
      it('should handle mixed data types', () => {
        const input = {
          user: {
            name: 'John',
            age: 30,
            active: true,
            scores: [85, 90, 78],
            metadata: {
              created: '2023-01-01',
              tags: ['user', 'active'],
            },
          },
          config: {
            debug: false,
            version: '1.0.0',
          },
        };

        const result = flattenObject(input);

        expect(result).to.have.property('user.name', 'John');
        expect(result).to.have.property('user.age', 30);
        expect(result).to.have.property('user.active', true);
        expect(result).to.have.property('user.scores.0', 85);
        expect(result).to.have.property('user.scores.1', 90);
        expect(result).to.have.property('user.scores.2', 78);
        expect(result).to.have.property('user.metadata.created', '2023-01-01');
        expect(result).to.have.property('user.metadata.tags.0', 'user');
        expect(result).to.have.property('user.metadata.tags.1', 'active');
        expect(result).to.have.property('config.debug', false);
        expect(result).to.have.property('config.version', '1.0.0');
      });

      it('should handle empty objects', () => {
        const input = {
          empty: {},
          nested: { empty: {} },
        };

        const result = flattenObject(input);
        expect(result).to.deep.equal({});
      });

      it('should combine all options correctly', () => {
        const input = {
          data: {
            items: [1, 2, { value: 'test' }],
            nullValue: null,
            func: () => {},
          },
        };

        const result = flattenObject(input, {
          separator: '|',
          prefix: 'root',
          preserveNull: true,
          includeArrays: false,
          excludeTypes: ['function', 'number'],
        });

        const expected = {
          'root|data|items': '[Array(3)]',
          'root|data|nullValue': null,
          'root|data|func': '[function]',
        };

        expect(result).to.deep.equal(expected);
      });
    });

    describe('Edge cases', () => {
      it('should handle very deep nesting within maxDepth', () => {
        let input = { value: 'end' };
        for (let i = 0; i < 5; i++) {
          input = { level: input };
        }

        const result = flattenObject(input, { maxDepth: 10 });
        expect(result).to.have.property('level.level.level.level.level.value', 'end');
      });

      it('should handle objects with numeric keys', () => {
        const input = {
          data: {
            0: 'first',
            1: 'second',
            10: 'tenth',
          },
        };

        const result = flattenObject(input);
        expect(result).to.deep.equal({
          'data.0': 'first',
          'data.1': 'second',
          'data.10': 'tenth',
        });
      });

      it('should handle objects with special characters in keys', () => {
        const input = {
          'key-with-dashes': 'value1',
          'key.with.dots': 'value2',
          'key with spaces': 'value3',
        };

        const result = flattenObject(input);
        expect(result).to.deep.equal({
          'key-with-dashes': 'value1',
          'key.with.dots': 'value2',
          'key with spaces': 'value3',
        });
      });

      it('should handle Date objects', () => {
        const date = new Date('2023-01-01');
        const input = { timestamp: date };

        const result = flattenObject(input);
        // Date objects have no own enumerable properties, so they become empty objects
        expect(result).to.deep.equal({});
      });

      it('should handle RegExp objects', () => {
        const regex = /test/g;
        const input = { pattern: regex };

        const result = flattenObject(input);
        // RegExp objects have 'lastIndex' but it's non-enumerable, so they become empty objects
        expect(result).to.deep.equal({});
      });
    });
  });
});
