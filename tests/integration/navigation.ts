const { suite, test } = intern.getPlugin('interface.tdd');
// const { assert } = intern.getPlugin('chai');

export default suite('navigation', () => {
  test('Test 1', tst => {
    return tst.remote
      .get('http://localhost:9000/tests/data/elements.html')
      .findByXpath('id("b2")')
        .moveMouseTo(5, 11)
        .clickMouseButton(0)
        .end()
      .refresh()
      .get('http://localhost:9000/tests/data/frame.html')
      .get('http://localhost:9000/tests/data/frame.html#test')
      .get('http://localhost:9000/tests/data/elements.html');
  });
});
