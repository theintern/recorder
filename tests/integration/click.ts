const { suite, test } = intern.getPlugin('interface.tdd');

// Uncomment the line below to use chai's 'assert' interface.
// const { assert } = intern.getPlugin('chai');

// Export the suite to ensure that it's built as a module rather
// than a simple script.
export default suite('click', () => {
  test('Test 1', tst => {
    return tst.remote
      .get('http://localhost:9000/tests/data/elements.html')
      .findByXpath('id("b2")')
        .moveMouseTo(59, 12)
        .clickMouseButton(0);
  });
});
