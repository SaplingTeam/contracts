// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * Withdrawal request queue for Sapling lending pools. 
 * The queue is virtual, and implements a doubly linked map with functions limited to intended business logic. 
 */
library WithdrawalRequestQueue {

    using EnumerableSet for EnumerableSet.UintSet;

    /// Withdrawal request position
    struct Request {

        /// Request ID
        uint256 id; 

        /// Requestor wallet address
        address wallet;

        /// Amount of pool tokens locked in this request
        uint256 sharesLocked;

        /* Preprocessing fields */

        /// Sum of pool tokens currently locked in all positions ahead in the queue
        uint256 sumOfSharesLockedAhead;

        /* Linked list fields */

        /// Index of this node in the list
        uint256 index;

        /// ID of the previous node
        uint256 prev;

        /// ID of the next node
        uint256 next;
    }

    /// Doubly linked map of withdrawal requests
    struct LinkedMap {

        /// ID of the last withdrawalRequest, for unique id generation
        uint256 _lastRequestId;

        /// ID of the head node
        uint256 _head;

        /// ID of the tail node
        uint256 _tail;

        /// Set of node IDs (unsorted)
        EnumerableSet.UintSet _ids;

        /// map of nodes (requests) by ID
        mapping (uint256 => Request) _requests;
    }

    /**
     * @notice Queue a new withdrawal request
     * @param list storage reference to LinkedMap
     * @param user requestor wallet address
     * @param shares poolTokens locked in the withdrawal request
     * @return id of the newly queued request
     */
    function queue(LinkedMap storage list, address user, uint256 shares) internal returns (uint256) {
        Request storage prevQueuedRequest = list._requests[list._tail];

        uint256 newId = list._lastRequestId + 1;

        list._requests[newId] = Request({
            id: newId,
            wallet: user,
            sharesLocked: shares,
            sumOfSharesLockedAhead: prevQueuedRequest.id != 0 
                ? prevQueuedRequest.sumOfSharesLockedAhead + prevQueuedRequest.sharesLocked 
                : 0,
            index: list._ids.length(),
            prev: list._tail,
            next: 0
        });

        list._lastRequestId = newId;
        list._ids.add(newId);

        if (list._head == 0) {
            list._head = newId;
        }

        if (list._tail != 0) {
            list._requests[list._tail].next = newId;
        }

        list._tail = newId;

        return newId;
    }

    /**
     * @notice Update an existing withdrawal request
     * @dev Locked token amount can only be decreased but must stay above 0. Use remove for a value of 0 instead.
     * @param list Storage reference to LinkedMap
     * @param id Requestor wallet address
     * @param newShareAmount new amount of poolTokens locked in the withdrawal request
     * @return Difference in the locked pool tokens after the update
     */
    function update(LinkedMap storage list, uint256 id, uint256 newShareAmount) internal returns (uint256) {
        require(list._ids.contains(id), "WithdrawalRequestQueue: not found");

        Request storage request = list._requests[id];
        require(
            0 < newShareAmount && newShareAmount < request.sharesLocked, 
            "WithdrawalRequestQueue: invalid shares amount"
        );
        
        uint256 shareDifference = request.sharesLocked - newShareAmount;

        if (request.next > 0) {
            for (uint256 i = request.next; i < list._ids.length(); i++) {                
                list._requests[i].sumOfSharesLockedAhead -= shareDifference;
            }
        }

        return shareDifference;
    }

    /**
     * @notice Remove an existing withdrawal request
     * @param list Storage reference to LinkedMap
     * @param id Requestor wallet address
     */
    function remove(LinkedMap storage list, uint256 id) internal {
        require(list._ids.contains(id), "WithdrawalRequestQueue: not found");

        Request storage request = list._requests[id];

        if (request.next > 0) {
            for (uint256 i = request.next; i < list._ids.length(); i++) {
                Request storage nextRequest = list._requests[i];
                
                nextRequest.index--;
                nextRequest.sumOfSharesLockedAhead -= request.sharesLocked;
            }

            list._requests[request.next].prev = request.prev;
        }

        if (request.prev > 0) {
            list._requests[request.prev].next = request.next;
        }
        
        list._ids.remove(id);

        if (id == list._head) {
            list._head = request.next;
        }

        if (id == list._tail) {
            list._tail = request.prev;
        }

        delete list._requests[id];
    }

    /**
     * @notice Accessor
     * @param list storage reference to LinkedMap
     * @return Length of the queue
     */
    function length(LinkedMap storage list) internal view returns(uint256) {
        return list._ids.length();
    }

    /**
     * @notice Accessor
     * @dev ID value of 0 is not used, and a return value of 0 means the queue is empty.
     * @param list Storage reference to LinkedMap
     * @return ID of the first (head) node in the queue
     */
    function head(LinkedMap storage list) internal view returns (uint256) {
        return list._head;
    }

    /**
     * @notice Accessor
     * @dev ID value of 0 is not used, and a return value of 0 means the queue is empty.
     * @param list storage reference to LinkedMap
     * @return ID of the last (tail) node in the queue
     */
    function tail(LinkedMap storage list) internal view returns (uint256) {
        return list._tail;
    }

    /**
     * @notice Accessor
     * @dev ID must belong to a node that is still in the queue.
     * @param list Storage reference to LinkedMap
     * @param id Id of the node to get
     * @return Node (withdrawal request) with the given ID
     */
    function get(LinkedMap storage list, uint256 id) internal view returns(Request memory) {
        require(list._ids.contains(id), "WithdrawalRequestQueue: not found");
        return list._requests[id];
    }

    /**
     * @notice Accessor
     * @dev Index must be within bounds/less than the queue length.
     * @param list Storage reference to LinkedMap
     * @param index Index of the node to get.
     * @return Node (withdrawal request) at the given index
     */
    function at(LinkedMap storage list, uint256 index) internal view returns(Request memory) {
        require(index < list._ids.length(), "WithdrawalRequestQueue: index out of bounds");

        uint256 current = list._head;
        for (uint256 i = 0; i < index; i++) {
            current = list._requests[current].next;
        }

        return list._requests[current];
    }
}