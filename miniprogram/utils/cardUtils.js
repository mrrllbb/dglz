// utils/cardUtils.js

const cardValues = {
  1: '3', 2: '4', 3: '5', 4: '6', 5: '7', 6: '8', 7: '9',
  8: '10', 9: 'J', 10: 'Q', 11: 'K', 12: 'A', 13: '2',
  14: 'BJ', 15: 'RJ'
}

const cardSuits = {
  0: '', // 王牌没有花色
  1: '♣',
  2: '♦',
  3: '♥',
  4: '♠'
}

const playTypes = {
  0: 'PASS',
  1: 'HIGH_CARD',
  2: 'PAIR',
  3: 'TRIPLET',
  4: 'STRAIGHT',
  5: 'FLUSH',
  6: 'FULL_HOUSE',
  7: 'FOUR_OF_A_KIND',
  8: 'STRAIGHT_FLUSH',
  9: 'FIVE_OF_A_KIND'
}

/**
 * 获取卡牌的显示值
 * @param {number} value - 卡牌值
 * @returns {string} 卡牌显示值
 */
function getCardValue(value) {
  return cardValues[value] || '?'
}

/**
 * 获取卡牌花色符号
 * @param {number} suit - 花色
 * @returns {string} 花色符号
 */
function getCardSuit(suit) {
  return cardSuits[suit] || ''
}

/**
 * 格式化卡牌为字符串
 * @param {object} card - 卡牌对象
 * @returns {string} 格式化后的卡牌字符串
 */
function formatCard(card) {
  if (!card) return ''
  const value = getCardValue(card.value)
  const suit = getCardSuit(card.suit)
  return `${value}${suit}`
}

/**
 * 比较两个卡牌的大小
 * @param {object} card1 - 第一张卡
 * @param {object} card2 - 第二张卡
 * @returns {number} 大于0表示card1更大，小于0表示card2更大，等于0表示相等
 */
function compareCards(card1, card2) {
  if (card1.value !== card2.value) {
    return card1.value - card2.value
  }
  if (card1.suit !== card2.suit) {
    return card1.suit - card2.suit
  }
  return 0
}

/**
 * 对卡牌数组排序
 * @param {array} cards - 卡牌数组
 * @returns {array} 排序后的卡牌数组
 */
function sortCards(cards) {
  return [...cards].sort(compareCards)
}

/**
 * 获取出牌类型的中文描述
 * @param {number} playType - 出牌类型
 * @returns {string} 类型描述
 */
function getPlayTypeDescription(playType) {
  const descriptions = {
    0: '过牌',
    1: '单牌',
    2: '对牌',
    3: '三张',
    4: '顺子',
    5: '同花',
    6: '葫芦',
    7: '四张',
    8: '同花顺',
    9: '五张'
  }
  return descriptions[playType] || '未知'
}

/**
 * 检查卡牌是否为王牌
 * @param {object} card - 卡牌对象
 * @returns {boolean}
 */
function isJoker(card) {
  return card.value === 14 || card.value === 15
}

/**
 * 检查卡牌是否相同
 * @param {object} card1 - 第一张卡
 * @param {object} card2 - 第二张卡
 * @returns {boolean}
 */
function isSameCard(card1, card2) {
  return card1.value === card2.value && 
         card1.suit === card2.suit && 
         card1.deckIndex === card2.deckIndex
}

module.exports = {
  cardValues,
  cardSuits,
  playTypes,
  getCardValue,
  getCardSuit,
  formatCard,
  compareCards,
  sortCards,
  getPlayTypeDescription,
  isJoker,
  isSameCard
}
