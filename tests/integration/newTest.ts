const { suite, test } = intern.getPlugin('interface.tdd');
// const { assert } = intern.getPlugin('chai');

export default suite('newTest', () => {
  test('Test 1', tst => {
    return tst.remote
      .get('http://localhost:9000/tests/data/frame.html')
      .then(() => {});
  });

  test('Test 2', tst => {
    return tst.remote
      .get('http://localhost:9000/tests/data/frame.html')
      .switchToFrame(0)
      .findByXpath('id("b2")')
        .moveMouseTo(12, 23)
        .clickMouseButton(0)
        .end()
      .switchToFrame(<any>null);
  });

  test('Test 3', tst => {
    return tst.remote
      .get('http://localhost:9000/tests/data/frame.html')
      .then(() => {});
  });
});
