const { suite, test } = intern.getPlugin('interface.tdd');
// const { assert } = intern.getPlugin('chai');

export default suite('click', () => {
  test('Test 1', tst => {
    return tst.remote
      .get('http://localhost:9000/tests/data/elements.html')
      .findByXpath('id("b2")')
        .moveMouseTo(59, 12)
        .clickMouseButton(0);
  });
});
