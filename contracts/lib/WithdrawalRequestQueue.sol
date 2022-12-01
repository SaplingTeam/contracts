// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library WithdrawalRequestQueue {
    using EnumerableSet for EnumerableSet.UintSet;

    struct Request {
        uint256 id;
        address wallet;
        uint256 sharesLocked;
        uint256 sumOfSharesLockedAhead;

        //linkedlist
        uint256 index;
        uint256 prev;
        uint256 next;
    }

    struct LinkedMap {
        uint256 _lastRequestId;
        uint256 _head;
        uint256 _tail;
        EnumerableSet.UintSet _ids;
        mapping (uint256 => Request) _requests;
    }

    function queue(LinkedMap storage list, address user, uint256 shares) internal returns (uint256) {
        Request storage prevQueuedRequest = list._requests[list._tail];

        uint256 newId = list._lastRequestId + 1;

        list._requests[list._lastRequestId] = Request({
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

        if (list._ids.length() == 1) {
            list._head = newId;
            list._tail = newId;
        } else {
            list._requests[list._tail].next = newId;
        }

        return newId;
    }

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
        if (list._ids.length() == 0) {
            list._head = 0;
            list._tail = 0;
        }

        delete list._requests[id];
    }

    function length(LinkedMap storage list) internal view returns(uint256) {
        return list._ids.length();
    }

    function head(LinkedMap storage list) internal view returns (uint256) {
        return list._head;
    }

    function tail(LinkedMap storage list) internal view returns (uint256) {
        return list._tail;
    }

    function get(LinkedMap storage list, uint256 id) internal view returns(Request memory) {
        require(list._ids.contains(id), "WithdrawalRequestQueue: not found");
        return list._requests[id];
    }

    function at(LinkedMap storage list, uint256 index) internal view returns(Request memory) {
        require(index < list._ids.length(), "WithdrawalRequestQueue: index out of bounds");

        uint256 current = list._head;
        for (uint256 i = 0; i < index; i++) {
            current = list._requests[current].next;
        }

        return list._requests[current];
    }
}